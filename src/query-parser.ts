/// <reference path="../typings/graphql.d.ts" />
/// <reference path="../typings/node.d.ts" />

import { parse } from 'graphql/language';
let util = require('util');

let doc = parse(`
{
  user(id: "1") {
    name
  }
}
`);

console.log(util.inspect(doc, false, 10));
