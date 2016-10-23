/**
 * Copyright (c) 2016, John Hewson
 * All rights reserved.
 */

/// <reference path="../typings/node.d.ts" />
/// <reference path="../typings/request.d.ts" />
/// <reference path="../typings/graphql-utilities.d.ts" />
/// <reference path="../typings/command-line-args.d.ts" />

import 'source-map-support/register';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import * as request from 'request';
import * as commandLineArgs from 'command-line-args';
import { introspectionQuery, buildClientSchema } from 'graphql/utilities';
import { GraphQLSchema } from 'graphql/type';
import { queryToElm } from './query-to-elm';

// entry point

let optionDefinitions = [
  { name: 'init', type: Boolean },
  { name: 'endpoint', type: String, defaultOption: true },
  { name: 'schema', type: String },
  { name: 'method', type: String },
  { name: 'help', type: Boolean },
];

let options: any = commandLineArgs(optionDefinitions);

// usage
if (options.help) {
  usage();
  process.exit(1);
}

// load config from elm-package.json
if (!fs.existsSync('elm-package.json')) {
  console.error('Error: expected elm-package.json');
  process.exit(1);
}

let elmPackageJson = JSON.parse(fs.readFileSync('elm-package.json', 'utf8'));
let config: any = elmPackageJson['graphql'];

if (options.init) {
  // usage
  if (!options.endpoint) {
    usage();
    process.exit(1);
  }

  elmPackageJson.graphql = {
    endpoint: options.endpoint
  };
  config = elmPackageJson.graphql;

  if (options.schema) {
    elmPackageJson.graphql.schema = options.schema;
  }

  if (options.method) {
    elmPackageJson.graphql.method = options.method;
  }

  // check that the endpoint works
  performIntrospectionQuery(body => {
    fs.writeFileSync('elm-package.json', JSON.stringify(elmPackageJson, null, '    '));
    
    console.log('Success! You should now run `elm package install jahewson/elm-graphql-module`.');
    process.exit();
  });
}



if (!config) {
  console.error('elm-graphql is not configured for this package. You need to run `elm graphql --init [URL]`.');
  process.exit(1);
}

// output config
let verb = config.method || 'GET';
let endpointUrl = config.endpoint;

performIntrospectionQuery(body => {
  let result = body;
  let schema = buildClientSchema(result.data);
  processFiles(schema);
});

function performIntrospectionQuery(callback: (body: any) => void) {
  // introspection query
  let introspectionUrl = config.schema || config.endpoint;
  if (!introspectionUrl) {
    console.log('Error: missing graphql endpoint in elm-package.json');
    process.exit(1);
  }

  let method = config.method || 'GET';
  let reqOpts = method == 'GET'
    ? { url: introspectionUrl,
        method,
        qs: {
          query: introspectionQuery.replace(/\n/g, '').replace(/\s+/g, ' ')
        }
      }
    : { url: introspectionUrl,
        method,
        headers: [{ 'Content-Type': 'application/json' }],
        json: true,
        body: { query: introspectionQuery }
      };

  request(reqOpts, function (err, res, body) {
    if (err) {
      throw new Error(err);
    } else if (res.statusCode == 200) {
      callback(body);
    } else {
      console.error('Error', res.statusCode, '-', res.statusMessage);
      console.error('\n', res.headers);
      console.error('\n', body.trim());
      console.error('\nThe GraphQL server at ' + introspectionUrl + ' responded with an error.');
      process.exit(1);
    }
  });
}

function processFiles(schema: GraphQLSchema) {
  let paths = scanDir('.', []);
 
  for (let filePath of paths) {
    let fullpath = path.join(...filePath);
    let graphql = fs.readFileSync(fullpath, 'utf8');

    let basename = path.basename(fullpath);
    let extname =  path.extname(fullpath);
    let filename = basename.substr(0, basename.length - extname.length);
    let moduleName = filename[0].toUpperCase() + filename.substr(1);

    let outPath = path.join(path.dirname(fullpath), filename + '.elm');

    let elm = queryToElm(graphql, moduleName, endpointUrl, verb, schema);
    fs.writeFileSync(outPath, elm);

    // if elm-format is available then run it on the output
    try {
      child_process.execSync('elm-format "' + outPath + '" --yes');
    } catch (e) {
      // ignore
    }
  }

  let plural = paths.length != 1 ? 's' : '';
  console.log('Success! Generated ' + paths.length + ' module' + plural + '.')
}

function scanDir(dirpath: string, parts: Array<string>): Array<Array<string>> {
  let filenames = fs.readdirSync(dirpath);
  let found: Array<Array<string>> = [];
  for (let filename of filenames) {
    let fullPath = path.join(dirpath, filename);
    if (fs.statSync(fullPath).isDirectory() && filename[0] != '.') {
      found = found.concat(scanDir(fullPath, parts.concat([filename])));
    } else {
      if (path.extname(filename) == '.graphql') {
        found.push(parts.concat(filename));
      }
    }
  }
  return found;
}

function usage() {
  let version  = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version;
  console.error('elm-graphql ' + version);
  console.error();
  console.error('Usage: elm graphql --init ENDPOINT-URL');
  console.error(' ');
  console.error('Available options:');
  console.error('  --schema URL            URL of the schema endpoint, if different.');
}
