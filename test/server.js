/**
 * Copyright (c) 2016, John Hewson
 * All rights reserved.
 */

var typeDefinition = [`
  union Foo = List | Task

  type User {
    id: ID!
    name: String
    lists: [List]
  }

  type List {
    id: ID!
    name: String
    owner: User
    incomplete_count: Int
    tasks(completed: Boolean): [Task]
  }

  type Task {
    id: ID!
    text: String
    completed: Boolean
    list: List
  }

  type RootQuery {
    user(id: ID): User
    test1: Foo
    test2: Foo
  }

  schema {
    query: RootQuery
  }
`];

// todo: any way to avoid having to pass these dummy resolvers?
var generateSchema = require('graphql-tools').generateSchema;
var jsSchema = generateSchema(typeDefinition, {
  RootQuery: {
    user: () => null,
    test1: () => null,
    test2: () => null
  },
  User: {
    lists: () => null
  },
  List: {
    owner: () => null,
    tasks: () => null
  },
  Task: {
    list: () => null,
  }
});
console.log(jsSchema);

var express = require('express');
var graphql = require('graphql');
var graphqlHTTP = require('express-graphql');

var app = express();

app.use('/graphql', graphqlHTTP({
  schema: jsSchema,
  graphiql: true
}));

var port = 3137;
app.listen(port);
console.log('GraphQL server listening on port', 3137);
