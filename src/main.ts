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
import * as request from 'request';
import * as commandLineArgs from 'command-line-args';
import { introspectionQuery, buildClientSchema } from 'graphql/utilities';
import { queryToElm } from './query-to-elm';

// entry point

let optionDefinitions = [
  { name: "method", alias: "m", type: String },
  { name: "args", type: String, multiple: true, defaultOption: true }
];

let options = commandLineArgs(optionDefinitions);

if (!options["args"]) {
  console.error('options: file <introspection_endpoint_url> <live_endpoint_url>');
  process.exit(1);
}
let introspectionUrl = options["args"][1] || 'http://localhost:8080/graphql';
let liveUrl = options["args"][2] || introspectionUrl;

let graphqlFile = options["args"][0];
let queries = fs.readFileSync(graphqlFile, 'utf8');

let basename = path.basename(graphqlFile);
let extname =  path.extname(graphqlFile);
let filename = basename.substr(0, basename.length - extname.length);
let moduleName = 'GraphQL.' + filename[0].toUpperCase() + filename.substr(1);

let outPath = path.join(path.dirname(graphqlFile), filename + '.elm');

let url = introspectionUrl;
let data = { query: introspectionQuery.replace(/\n/g, '') };
let method = options["method"] || "GET";
let reqOpts = method == "GET"
                ? { url, method, qs: data }
                : { url,
                    method,
                    headers: [{ "Content-Type": "application/json" }],
                    body: JSON.stringify(data)
                  };

let verb = options['method'] || 'GET';

request(reqOpts, function (err, res, body) {
  if (err) {
    throw new Error(err);
  } else if (res.statusCode == 200) {
    let result = JSON.parse(body);
    let schema = buildClientSchema(result.data);
    let elm = queryToElm(queries, moduleName, liveUrl, verb, schema);
    fs.writeFileSync(outPath, elm);
  } else {
    throw new Error('HTTP status ' + res.statusCode);
  }
});
