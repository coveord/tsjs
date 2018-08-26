#! /usr/bin/env node
const path = require('path');
const fs = require('fs');
const {flow, update} = require('lodash/fp');
const {Linter, Configuration} = require('tslint');
const tsfmt = require('typescript-formatter');

const argv = require('yargs')
    .alias('h', 'help')
    .alias('v', 'version')
    .alias('e', 'exclude')
    .alias('a', 'all')
    .alias('c', 'tsconfig')
    .alias('n', 'nounusedvar')
    .alias('p', 'ignorepattern')
    .option('exclude', {
        description: 'Specify globs to exclude. Use with --all option.',
        type: 'array',
    })
    .option('all', {
        description: 'Include all files specified in the provided tsconfig.json',
        type: 'boolean',
    })
    .option('tsconfig', {
        description: 'Provide a custom tsconfig file. This option is ignored if the --all option is used.',
        default: 'tsconfig.json',
        type: 'string',
    })
    .option('nounusedvar', {
        description: 'Disallow unused imports, variables, functions and private class members',
        type: 'boolean',
    })
    .option('ignorepattern', {
        description: 'Use with --nounused option to ignore variable names and imports that will match the pattern provided. More details at https://palantir.github.io/tslint/rules/no-unused-variable/ ',
        type: 'string',
    })
    .argv;

const tslintPath = path.join(__dirname, 'tslint.json');
const tsfmtPath = path.join(__dirname, 'tsfmt.json');
const tsconfigPath = path.join(__dirname, 'tsconfig.lint.json');
const tempTsLintFile = '.tslint.temp.json';
const tempTsfmtFile = '.tsfmt.temp.json';
const tempTsConfigFile = '.tsconfig.lint.temp.json';
let tsConfigFile = argv.tsconfig || 'tsconfig.json';
let tsConfigLint = {exclude: []};
const tsLintExcludeOptionArray = argv.exclude || [];

process.on('exit', () => {
    fs.unlinkSync(tempTsConfigFile);
    fs.unlinkSync(tempTsfmtFile);
    fs.unlinkSync(tempTsLintFile);
});

try {
    fs.writeFileSync(tempTsfmtFile, JSON.stringify(require(tsfmtPath)));
    fs.writeFileSync(
        tempTsLintFile,
        flow(
            update('no-unused-variable[1].ignore-pattern', (val) => argv.ignorepattern || val),
            update('no-unused-variable', (val) => (argv.nounusedvar && val) || undefined),
            JSON.stringify
        )(require(tslintPath))
    );

    if (argv.all) {
        tsConfigLint = require(tsconfigPath);
        tsConfigLint.exclude = [...tsConfigLint.exclude, ...tsLintExcludeOptionArray];
        fs.writeFileSync(tempTsConfigFile, JSON.stringify(tsConfigLint));
        tsConfigFile = tempTsConfigFile;
    }

    [
        'Starting tsjs with the following configuration:',
        'tslint: tsjs configuration',
        'tsfmt: tsjs configuration',
        `tsconfig: ${tsConfigFile}`,
        'excluded files and/or folders:',
        `  ${tsConfigLint.exclude.join('\n  ')}\n`,
    ].forEach((line) => console.log(line));

    console.log('\nRunning tslint...\n');
    const program = Linter.createProgram(tsConfigFile, '.');
    const linter = new Linter({fix: true}, program);

    const files = Linter.getFileNames(program);
    files.forEach((file) => {
        const fileContents = program.getSourceFile(file).getFullText();
        const configuration = Configuration.findConfiguration(tempTsLintFile, file).results;
        linter.lint(file, fileContents, configuration);
    });

    console.log('\nRunning tsfmt...\n');
    tsfmt.processFiles(files, {
        replace: true,
        tsconfig: true,
        tsconfigFile: tsConfigFile,
        tslint: true,
        tslintFile: tempTsLintFile,
        editorconfig: false,
        vscode: false,
        vscodeFile: null,
        tsfmt: true,
        tsfmtFile: tempTsfmtFile,
    })
        .then(() => console.log('Tsjs linting and formatting completed successfully. See additional logs above for details.'));

} catch (e) {
    console.log(e);

    console.log('\nSomething went wrong while running tsjs. See error below and additional logs above for details.\n');

    process.exit(1);
}