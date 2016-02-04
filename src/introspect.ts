/// <reference path="../typings/node.d.ts" />

let Lokka = require('lokka').Lokka;
let Transport = require('lokka-transport-http').Transport;
let util = require('util');

let client = new Lokka({
  transport: new Transport('http://graphql-swapi.parseapp.com/')
});

client.query(`
  {
    __schema {
      types {
        name
        kind
        fields {
          name
          type {
            name
            kind
            ofType {
              name
              kind
            }
          }
        }
      }
    }
  }
`).then(result => {
  console.log(util.inspect(result, false, 10));
});
