# elm-graphql

`elm-graphql` generates [Elm](http://elm-lang.org) code for making [GraphQL](http://graphql.org) queries in a type-safe manner.

At compile time, `elm-graphql` takes GraphQL schema and named queries in a
.graphql file and generates corresponding Elm types. The schema is obtained by introspection
of a live GraphQL server.

`elm-graphql` is simply for making queries, it **is not** a framework like [Relay](https://facebook.github.io/relay/) but it could be the foundation other abstractions in the future.

## Install

    npm install -g elm-graphql

## Usage

Configure the GraphQL endpoint URL. This will be saved in `elm-package.json`:

    elm graphql --init URL

Now you can generate an Elm module for each .graphql file:

    elm graphql

## Example

Check out my [elm-graphql-demo](https://github.com/jahewson/elm-graphql-demo) which provides a sample application and includes full build instructions.

## How it works

See the wiki page, [how elm-graphql works](https://github.com/jahewson/elm-graphql/wiki/How-elm-graphql-works) for more details.

## Projects using elm-graphql

- [elm-hipster-stack](https://github.com/carleryd/elm-hipster-stack): Elm, Phoenix, GraphQL and RethinkDB
