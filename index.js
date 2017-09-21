'use strict';

const chalk = require('chalk');
const inquirer = require('inquirer');
const jsforce = require('jsforce');
const Store = require('jfs');
const yargs = require('yargs');

const argv = yargs.option('c', {
  alias: 'connection',
  describe: 'Name of a pre-configured connection',
  type: 'string',
}).argv;

const db = new Store('./.jsforce', { single: false, pretty: true });

const CREATE_NEW = 'Create New';

const getConnections = () => {
  let res = db.getSync('connections');
  if (res instanceof Error) {
    db.saveSync('connections', (res = []));
  }
  return res;
};

const getServerList = () => [
  CREATE_NEW,
  ...getConnections()
    .map(c => c.alias)
    .filter(n => !!n),
];

const findConnection = alias => {
  const connections = db.getSync('connections');
  return connections.find(c => c.alias === alias);
};

const testConnection = ({ loginUrl, username, password, securityToken }) => {
  const conn = new jsforce.Connection({ loginUrl });
  return conn.login(username, password + securityToken);
};

const promptCreds = resolve => {
  let _answers;
  const doPrompt = answers =>
    (_answers = answers) && answers.chosen_alias === CREATE_NEW;

  const prompts = [
    {
      type: 'list',
      name: 'chosen_alias',
      message: 'Choose which connection to use:',
      choices: getServerList(),
      default: CREATE_NEW,
      when: () => !getServerList().includes(argv.c),
    },
    {
      type: 'input',
      name: 'alias',
      message: 'Enter a unique alias for this connection:',
      validate: input => input.length > 0 && !getServerList().includes(input),
      when: doPrompt,
    },
    {
      type: 'input',
      name: 'loginUrl',
      message: 'Enter the login URL:',
      default: 'https://test.salesforce.com',
      validate: input => input.startsWith('https://'),
      when: doPrompt,
    },
    {
      type: 'input',
      name: 'username',
      message: 'Enter your username:',
      validate: input => input.length > 0,
      when: doPrompt,
    },
    {
      type: 'password',
      name: 'password',
      message: 'Enter your password:',
      validate: input => input.length > 0,
      when: doPrompt,
    },
    {
      type: 'input',
      name: 'securityToken',
      message: 'Enter your security token:',
      when: doPrompt,
    },
  ];
  inquirer.prompt(prompts).then(answers => {
    if (!_answers) {
      answers = { chosen_alias: argv.c };
    }
    let creds;
    if (answers.chosen_alias === CREATE_NEW) {
      creds = answers;
    } else {
      const connection = findConnection(answers.chosen_alias);
      creds = connection;
    }
    testConnection(creds)
      .then(() => resolve(answers))
      .catch(err => {
        console.error(chalk.red(err.message));
        return this.creds();
      });
  });
};

const creds = () =>
  new Promise((resolve, reject) => {
    if (getServerList().includes(argv.c)) {
      resolve(findConnection(argv.c));
    } else {
      promptCreds(resolve, reject);
    }
  });

creds().then(answers => {
  const connections = getConnections();
  connections.forEach(c => (c.active = false));
  if (answers.chosen_alias === CREATE_NEW) {
    connections.push({
      active: true,
      alias: answers.alias,
      loginUrl: answers.loginUrl,
      username: answers.username,
      password: answers.password,
      securityToken: answers.securityToken,
    });
  } else {
    connections.find(c => c.alias === answers.chosen_alias).active = true;
  }
  db.saveSync('connections', connections);
});
