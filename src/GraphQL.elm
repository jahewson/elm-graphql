module GraphQL exposing (..)
{-| Todo: Write documentation for this module.

# Todo: Exports
@docs query, queryResult, apply
-}


import Task exposing (Task)
import Json.Decode exposing (..)
import Json.Encode
import Http

{-| Todo: document this
-}
type alias ID = String

{-| Todo: document this function.
-}
query : String -> String -> String -> String -> Decoder a -> Task Http.Error a
query url query operation variables decoder =
    get (queryResult decoder) (Http.url url [
        ( "query", query ),
        ( "operationName", operation ),
        ( "variables", variables )])

{-| Todo: document this function.
-}
get : Decoder value -> String -> Task Http.Error value
get decoder url =
  let request =
        { verb = "GET"
        , headers =
            [ ("Accept", "application/json")
            ]
        , url = url
        , body = Http.empty
        }
  in
      Http.fromJson decoder (Http.send Http.defaultSettings request)

{-| Todo: document this function.
-}
queryResult : Decoder a -> Decoder a
queryResult decoder =
    -- todo: check for success/failure of the query
    oneOf
    [ at ["data"] decoder
    , fail "Expected 'data' field"   -- todo: report failure reason from server
    ]


{-| Todo: document this function.
-}
apply : Decoder (a -> b) -> Decoder a -> Decoder b
apply func value =
    object2 (<|) func value


{-| Todo: document this function.
-}
maybeEncode : (a -> Value) -> Maybe a -> Value
maybeEncode e v = case v of
    Nothing -> Json.Encode.null
    Just a -> e a
