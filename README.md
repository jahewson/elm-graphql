# elm-graphql

`elm-graphql` generates Elm code for making GraphQL queries in a type-safe manner.

At compile time, `elm-graphql` takes GraphQL schema and named queries in a
.graphql file and generates corresponding Elm types. The schema is obtained by introspection
of a live GraphQL server.

`elm-graphql` is written in TypeScript and uses Facebook's [graphql-js](https://github.com/graphql/graphql-js)
to handle the GraphQL parsing.

## Install

    npm install -g elm-graphql

## Usage

    elm graphql

## Example

Check out my [elm-graphql-demo](https://github.com/jahewson/elm-graphql-demo) which provides a sample application and includes full build instructions.

## How it works

See the wiki page, [how elm-graphql works](https://github.com/jahewson/elm-graphql/wiki/How-elm-graphql-works) for more details.

## Projects using elm-graphql

- [elm-hipster-stack](https://github.com/carleryd/elm-hipster-stack): Elm, Phoenix, GraphQL and RethinkDB
