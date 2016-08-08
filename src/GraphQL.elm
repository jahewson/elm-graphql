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
type alias ID =
    String


{-| Todo: document this function.
-}
query : String -> String -> String -> String -> Json.Encode.Value -> Decoder a -> Task Http.Error a
query method url query operation variables decoder =
    fetch method url query operation variables decoder


{-| Todo: document this function.
-}
mutation : String -> String -> String -> Json.Encode.Value -> Decoder a -> Task Http.Error a
mutation url query operation variables decoder =
    fetch "POST" url query operation variables decoder


{-| Todo: document this function.
-}
fetch : String -> String -> String -> String -> Json.Encode.Value -> Decoder a -> Task Http.Error a
fetch verb url query operation variables decoder =
    let
        request =
            (case verb of
                "GET" ->
                    buildRequestWithURLParams verb url query operation variables

                _ ->
                    buildRequestWithBody verb url query operation variables
            )
    in
        Http.fromJson (queryResult decoder) (Http.send Http.defaultSettings request)


{-| Todo: document this function.
-}
buildRequestWithURLParams : String -> String -> String -> String -> Json.Encode.Value -> Http.Request
buildRequestWithURLParams verb url query operation variables =
    let
        params =
            [ ( "query", query )
            , ( "operationName", operation )
            , ( "variables", (Json.Encode.encode 0 variables) )
            ]
    in
        { verb = verb
        , headers = [ ( "Accept", "application/json" ) ]
        , url = Http.url url params
        , body = Http.empty
        }


{-| Todo: document this function.
-}
buildRequestWithBody : String -> String -> String -> String -> Json.Encode.Value -> Http.Request
buildRequestWithBody verb url query operation variables =
    let
        params =
            Json.Encode.object
                [ ( "query", Json.Encode.string query )
                , ( "operationName", Json.Encode.string operation )
                , ( "variables", variables )
                ]
    in
        { verb = verb
        , headers =
            [ ( "Accept", "application/json" )
            , ( "Content-Type", "application/json" )
            ]
        , url = Http.url url []
        , body = Http.string <| Json.Encode.encode 0 params
        }


{-| Todo: document this function.
-}
queryResult : Decoder a -> Decoder a
queryResult decoder =
    -- todo: check for success/failure of the query
    oneOf
        [ at [ "data" ] decoder
        , fail "Expected 'data' field"
          -- todo: report failure reason from server
        ]


{-| Todo: document this function.
-}
apply : Decoder (a -> b) -> Decoder a -> Decoder b
apply func value =
    object2 (<|) func value


{-| Todo: document this function.
-}
maybeEncode : (a -> Value) -> Maybe a -> Value
maybeEncode e v =
    case v of
        Nothing ->
            Json.Encode.null

        Just a ->
            e a
