/**
 *  Copyright (c) 2015, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */
/// <reference path="../typings/es6-promise.d.ts" />
/// <reference path="../typings/graphql.d.ts" />
var type_1 = require('graphql/type');
var starWarsData_1 = require('./starWarsData');
/**
 * This is designed to be an end-to-end test, demonstrating
 * the full GraphQL stack.
 *
 * We will create a GraphQL schema that describes the major
 * characters in the original Star Wars trilogy.
 *
 * NOTE: This may contain spoilers for the original Star
 * Wars trilogy.
 */
/**
 * Using our shorthand to describe type systems, the type system for our
 * Star Wars example is:
 *
 * enum Episode { NEWHOPE, EMPIRE, JEDI }
 *
 * interface Character {
 *   id: String!
 *   name: String
 *   friends: [Character]
 *   appearsIn: [Episode]
 * }
 *
 * type Human : Character {
 *   id: String!
 *   name: String
 *   friends: [Character]
 *   appearsIn: [Episode]
 *   homePlanet: String
 * }
 *
 * type Droid : Character {
 *   id: String!
 *   name: String
 *   friends: [Character]
 *   appearsIn: [Episode]
 *   primaryFunction: String
 * }
 *
 * type Query {
 *   hero(episode: Episode): Character
 *   human(id: String!): Human
 *   droid(id: String!): Droid
 * }
 *
 * We begin by setting up our schema.
 */
/**
 * The original trilogy consists of three movies.
 *
 * This implements the following type system shorthand:
 *   enum Episode { NEWHOPE, EMPIRE, JEDI }
 */
var episodeEnum = new type_1.GraphQLEnumType({
    name: 'Episode',
    description: 'One of the films in the Star Wars Trilogy',
    values: {
        NEWHOPE: {
            value: 4,
            description: 'Released in 1977.'
        },
        EMPIRE: {
            value: 5,
            description: 'Released in 1980.'
        },
        JEDI: {
            value: 6,
            description: 'Released in 1983.'
        }
    }
});
/**
 * Characters in the Star Wars trilogy are either humans or droids.
 *
 * This implements the following type system shorthand:
 *   interface Character {
 *     id: String!
 *     name: String
 *     friends: [Character]
 *     appearsIn: [Episode]
 *   }
 */
var characterInterface = new type_1.GraphQLInterfaceType({
    name: 'Character',
    description: 'A character in the Star Wars Trilogy',
    fields: function () { return ({
        id: {
            type: new type_1.GraphQLNonNull(type_1.GraphQLString),
            description: 'The id of the character.'
        },
        name: {
            type: type_1.GraphQLString,
            description: 'The name of the character.'
        },
        friends: {
            type: new type_1.GraphQLList(characterInterface),
            description: 'The friends of the character, or an empty list if they ' +
                'have none.'
        },
        appearsIn: {
            type: new type_1.GraphQLList(episodeEnum),
            description: 'Which movies they appear in.'
        }
    }); },
    resolveType: function (character) {
        return starWarsData_1.getHuman(character.id) ? humanType : droidType;
    }
});
/**
 * We define our human type, which implements the character interface.
 *
 * This implements the following type system shorthand:
 *   type Human : Character {
 *     id: String!
 *     name: String
 *     friends: [Character]
 *     appearsIn: [Episode]
 *   }
 */
var humanType = new type_1.GraphQLObjectType({
    name: 'Human',
    description: 'A humanoid creature in the Star Wars universe.',
    fields: function () { return ({
        id: {
            type: new type_1.GraphQLNonNull(type_1.GraphQLString),
            description: 'The id of the human.'
        },
        name: {
            type: type_1.GraphQLString,
            description: 'The name of the human.'
        },
        friends: {
            type: new type_1.GraphQLList(characterInterface),
            description: 'The friends of the human, or an empty list if they ' +
                'have none.',
            resolve: function (human) { return starWarsData_1.getFriends(human); }
        },
        appearsIn: {
            type: new type_1.GraphQLList(episodeEnum),
            description: 'Which movies they appear in.'
        },
        homePlanet: {
            type: type_1.GraphQLString,
            description: 'The home planet of the human, or null if unknown.'
        }
    }); },
    interfaces: [characterInterface]
});
/**
 * The other type of character in Star Wars is a droid.
 *
 * This implements the following type system shorthand:
 *   type Droid : Character {
 *     id: String!
 *     name: String
 *     friends: [Character]
 *     appearsIn: [Episode]
 *     primaryFunction: String
 *   }
 */
var droidType = new type_1.GraphQLObjectType({
    name: 'Droid',
    description: 'A mechanical creature in the Star Wars universe.',
    fields: function () { return ({
        id: {
            type: new type_1.GraphQLNonNull(type_1.GraphQLString),
            description: 'The id of the droid.'
        },
        name: {
            type: type_1.GraphQLString,
            description: 'The name of the droid.'
        },
        friends: {
            type: new type_1.GraphQLList(characterInterface),
            description: 'The friends of the droid, or an empty list if they ' +
                'have none.',
            resolve: function (droid) { return starWarsData_1.getFriends(droid); }
        },
        appearsIn: {
            type: new type_1.GraphQLList(episodeEnum),
            description: 'Which movies they appear in.'
        },
        primaryFunction: {
            type: type_1.GraphQLString,
            description: 'The primary function of the droid.'
        }
    }); },
    interfaces: [characterInterface]
});
/**
 * This is the type that will be the root of our query, and the
 * entry point into our schema. It gives us the ability to fetch
 * objects by their IDs, as well as to fetch the undisputed hero
 * of the Star Wars trilogy, R2-D2, directly.
 *
 * This implements the following type system shorthand:
 *   type Query {
 *     hero(episode: Episode): Character
 *     human(id: String!): Human
 *     droid(id: String!): Droid
 *   }
 *
 */
var queryType = new type_1.GraphQLObjectType({
    name: 'Query',
    fields: function () { return ({
        hero: {
            type: characterInterface,
            args: {
                episode: {
                    description: 'If omitted, returns the hero of the whole saga. If ' +
                        'provided, returns the hero of that particular episode.',
                    type: episodeEnum
                }
            },
            resolve: function (root, _a) {
                var episode = _a.episode;
                return starWarsData_1.getHero(episode);
            }
        },
        human: {
            type: humanType,
            args: {
                id: {
                    description: 'id of the human',
                    type: new type_1.GraphQLNonNull(type_1.GraphQLString)
                }
            },
            resolve: function (root, _a) {
                var id = _a.id;
                return starWarsData_1.getHuman(id);
            }
        },
        droid: {
            type: droidType,
            args: {
                id: {
                    description: 'id of the droid',
                    type: new type_1.GraphQLNonNull(type_1.GraphQLString)
                }
            },
            resolve: function (root, _a) {
                var id = _a.id;
                return starWarsData_1.getDroid(id);
            }
        }
    }); }
});
/**
 * Finally, we construct our schema (whose starting query type is the query
 * type we defined above) and export it.
 */
exports.StarWarsSchema = new type_1.GraphQLSchema({
    query: queryType
});
//# sourceMappingURL=starWarsSchema.js.map