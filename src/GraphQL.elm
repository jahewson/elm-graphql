module GraphQL (..) where
{-| Todo: Write documentation for this module.

# Todo: Exports
@docs query, queryResult, apply
-}


import Task exposing (Task)
import Json.Decode exposing (..)
import Http


{-| Todo: document this function.
-}
query : String -> String -> String -> String -> Decoder a -> Task Http.Error a
query url query operation variables decoder =
    Http.get (queryResult decoder) (Http.url url [
        ( "query", query ),
        ( "operationName", operation ),
        ( "variables", variables )])


{-| Todo: document this function.
-}
queryResult : Decoder a -> Decoder a
queryResult decoder =
    -- todo: check for success/failure of the query
    oneOf
    [ at ["data"] decoder
    , fail "expecting data"   -- todo: report failure reason from server
    ]


{-| Todo: document this function.
-}
apply : Decoder (a -> b) -> Decoder a -> Decoder b
apply func value =
    object2 (<|) func value
