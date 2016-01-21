### ⚠ UNDER DEVELOPMENT ⚠

---

# elm-graphql

`elm-graphql` aims to generate Elm code for making GraphQL queries in a type-safe manner.
It's being developed at the bi-weekly [Elm Hackathon](http://www.meetup.com/Elm-user-group-SF/).
Contributions are welcome.

The current prototype uses [graphql-js](https://github.com/graphql/graphql-js) to parse a GraphQL
schema, then generates the corresponding Elm type declarations. The code is in TypeScript, though
it's essentially vanilla ES6.

Right now we're generating types corresponding to the overall schema, but the plan is to generate
types and query wrapper code for each individual query, because a query can ask for only *some*
fields from the schema. By generating types for each query, we should be able to cut down on the
number of Maybe types which are needed.

## Build

    npm install .
    npm run build
    
## Run

This demo converts the starwars schema to Elm:

    node lib/elm-graphql.js

## Sample Output

Here's the Elm type declarations generated from the starwars schema:

```elm
type alias Query =
    { hero : Maybe Character
    , human : Maybe Human
    , droid : Maybe Droid
    }


type alias Character =
    { id : String
    , name : Maybe String
    , friends : Maybe (List Character)
    , appearsIn : Maybe (List Episode)
    }


type alias Human =
    { id : String
    , name : Maybe String
    , friends : Maybe (List Character)
    , appearsIn : Maybe (List Episode)
    , homePlanet : Maybe String
    }


type alias Droid =
    { id : String
    , name : Maybe String
    , friends : Maybe (List Character)
    , appearsIn : Maybe (List Episode)
    , primaryFunction : Maybe String
    }


type Episode
    = NEWHOPE
    | EMPIRE
    | JEDI
```
