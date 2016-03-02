⚠ This is a work in progress!

---

# elm-graphql

`elm-graphql` aims to generate Elm code for making GraphQL queries in a type-safe manner.
It's being developed at the bimonthly [Elm Hackathon](http://www.meetup.com/Elm-user-group-SF/).
Contributions are welcome.

This prototype consists of a code generator which takes GraphQL schema and named queries in a
.graphql file and generates corresponding Elm types. The schema is obtained by introspection
of a live GraphQL server.

The type of each query is a single large record. We do not generate type aliases for each "object",
because GraphQL allows different fields to be selected for the same type at different nesting
levels within the same query. Elm's extensible records mean that there's really no reason to want
to do this anyway.

We use Facebook's [graphql-js](https://github.com/graphql/graphql-js) to parse a GraphQL
schema.

This is a work in progress, still to do:

- [ ] Fragments (these could become type aliases?)
- [ ] ID types (i.e. references)
- [ ] Mutation
- [ ] Directives
- [ ] Default values (for parameters - use a Maybe?)
- [ ] Aliases

## Build

    npm install .
    npm run build
    
## Demo

Check out my [elm-graphql-demo](https://github.com/jahewson/elm-graphql-demo) which provides a sample application and includes full build instructions.
