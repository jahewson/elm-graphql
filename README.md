### ⚠ UNDER DEVELOPMENT ⚠

---

# elm-graphql

`elm-graphql` aims to generate Elm code for making GraphQL queries in a type-safe manner.
It's being developed at the bi-weekly [Elm Hackathon](http://www.meetup.com/Elm-user-group-SF/).
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
    
## Run

First, you'll need a GraphQL server running on local host.
Clone my [graphql-starwars](https://github.com/jahewson/graphql-starwars) repo to
get up and running quickly.

Now you can convert the `queries.graphql` file to Elm, using the live starwars schema:

    node lib/query-to-elm.js

You can also provide your own arguments:

    node lib/query-to-elm.js [endpointUri] [elmModuleName] [graphqlFile]

## Example

Here's a GraphQL query which uses the the [starwars schema](https://github.com/jahewson/graphql-starwars/blob/master/src/thirdparty/starWarsSchema.js):

```graphql
query queryFriends($id: String!) {
    human(id: $id) {
        name
        appearsIn
        friends {
            name
        }
    }
}
```

And here's the Elm type declarations generated for the query:

```elm
module StarWars (..) where

type Episode
    = NEWHOPE
    | EMPIRE
    | JEDI


type alias QueryFriendsResult =
    { human :
        { name : Maybe String
        , appearsIn : List Episode
        , friends :
            { name : Maybe String
            }
        }
    }
```

We also generate a function to execute the query:

```elm
queryFriends : String -> Task Http.Error QueryFriendsResult
queryFriends id =
    GraphQL.query "queryFriends" [id]
```

Note that this code doesn't run yet as I'm still working on
implementing the GraphQL.query function.
