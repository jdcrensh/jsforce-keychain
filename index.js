#!/usr/bin/env node

'use strict';

const { promisify } = require('util');
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
db.getAsync = promisify(db.get);
db.saveAsync = promisify(db.save);

const CREATE_NEW = 'Create New';

const getConnections = async () => {
  try {
    return await db.getAsync('connections');
  } catch (err) {
    await db.saveAsync('connections', []);
    return [];
  }
};

const getServerList = async () => [
  CREATE_NEW,
  ...(await getConnections()).map(c => c.alias).filter(n => !!n),
];

const findConnection = async alias => {
  const connections = await db.getAsync('connections');
  return connections.find(c => c.alias === alias);
};

const testConnection = ({ loginUrl, username, password, securityToken }) => {
  const conn = new jsforce.Connection({ loginUrl });
  return conn.login(username, password + securityToken);
};

const promptCreds = async () => {
  let _answers;
  const doPrompt = answers =>
    (_answers = answers) && answers.chosen_alias === CREATE_NEW;

  const prompts = [
    {
      type: 'list',
      name: 'chosen_alias',
      message: 'Choose which connection to use:',
      choices: await getServerList(),
      default: CREATE_NEW,
      when: async () => !(await getServerList()).includes(argv.c),
    },
    {
      type: 'input',
      name: 'alias',
      message: 'Enter a unique alias for this connection:',
      validate: async input =>
        input.length > 0 && !(await getServerList()).includes(input),
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
  let answers = await inquirer.prompt(prompts);
  if (!_answers) {
    answers = { chosen_alias: argv.c };
  }
  let res;
  if (answers.chosen_alias === CREATE_NEW) {
    res = answers;
  } else {
    const connection = await findConnection(answers.chosen_alias);
    res = connection;
  }
  try {
    testConnection(res);
    return answers;
  } catch (err) {
    console.error(chalk.red(err.message));
    return await creds();
  }
};

const creds = async () => {
  const serverList = await getServerList();
  if (serverList.includes(argv.c)) {
    return await findConnection(argv.c);
  }
  return promptCreds();
};

const prompt = async () => {
  const answers = await creds();
  const connections = await getConnections();
  for (const c of connections) {
    c.active = false;
  }
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
    const chosen = connections.find(c => c.alias === answers.chosen_alias);
    chosen.active = true;
  }
  db.saveSync('connections', connections);
};

module.exports = { prompt, getConnections };
