/**
 * Copyright (c) 2016, John Hewson
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     1. Redistributions of source code must retain the above copyright
 *        notice, this list of conditions and the following disclaimer.
 *     2. Redistributions in binary form must reproduce the above copyright
 *        notice, this list of conditions and the following disclaimer in the
 *        documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
/// <reference path="../typings/graphql.d.ts" />
var type_1 = require('graphql/type');
var starWarsSchema_1 = require('./starWarsSchema');
/**
 * Returns a (name -> type) mapping of the top-level type declarations in a GraphQL schema.
 */
function getTypeDecls(schema) {
    var map = {};
    var queue = [schema._queryType];
    while (queue.length > 0) {
        var ty = queue.shift();
        // unpack lists and maybes (possibly recursive)
        while (ty instanceof type_1.GraphQLNonNull ||
            ty instanceof type_1.GraphQLList) {
            ty = ty.ofType;
        }
        // sanity check
        if (!ty.name) {
            throw new Error('should not happen');
        }
        // for non-scalars, check if we've seen it
        if (!(ty instanceof type_1.GraphQLScalarType)) {
            if (map[ty.name]) {
                continue;
            }
            else {
                // if not, store it
                map[ty.name] = ty;
            }
        }
        // recurse into the fields of object types
        if (ty instanceof type_1.GraphQLObjectType ||
            ty instanceof type_1.GraphQLInterfaceType) {
            var config = ty._typeConfig;
            var fields = config.fields instanceof Function ? config.fields() : config.fields;
            for (var _i = 0, _a = Object.keys(fields); _i < _a.length; _i++) {
                var k = _a[_i];
                var t = fields[k].type;
                queue.push(t);
            }
        }
        else {
            if (!(ty instanceof type_1.GraphQLScalarType ||
                ty instanceof type_1.GraphQLEnumType)) {
                throw new Error('unexpected type ' + ty.name);
            }
        }
    }
    return map;
}
/**
 * Translates a top-level GraphQL type declaration to Elm.
 */
function typeDeclToElm(type) {
    if (type instanceof type_1.GraphQLObjectType ||
        type instanceof type_1.GraphQLInterfaceType) {
        // extract the fields
        var config = type._typeConfig;
        var fields = config.fields instanceof Function ? config.fields() : config.fields;
        // map to Elm
        var elmFields = [];
        for (var _i = 0, _a = Object.keys(fields); _i < _a.length; _i++) {
            var k = _a[_i];
            var fieldType = fields[k].type;
            var elmField = fieldToElm(fieldType);
            // most types are implicitly nullable
            if (!(fieldType instanceof type_1.GraphQLNonNull)) {
                if (elmField.indexOf(' ') > -1) {
                    elmField = 'Maybe (' + elmField + ')';
                }
                else {
                    elmField = 'Maybe ' + elmField;
                }
            }
            elmFields.push(k + ' : ' + elmField);
        }
        return 'type alias ' + type.name + ' =\n' +
            '    { ' + elmFields.join('\n    , ') + '\n    }\n';
    }
    else if (type instanceof type_1.GraphQLEnumType) {
        return 'type ' + type.name + '\n' +
            '    = ' + type._values.map(function (v) { return v.name; }).join('\n    | ') + '\n';
    }
    else {
        throw new Error('unexpected top-level type ' + type.constructor);
    }
}
/**
 * Translates a GraphQL field type to Elm.
 */
function fieldToElm(type) {
    if (type instanceof type_1.GraphQLObjectType ||
        type instanceof type_1.GraphQLInterfaceType) {
        return type.name;
    }
    else if (type instanceof type_1.GraphQLScalarType) {
        switch (type.name) {
            case 'String': return 'String';
            case 'Boolean': return 'Boolean';
            default: throw new Error('unexpected scalar type ' + type.name);
        }
    }
    else if (type instanceof type_1.GraphQLEnumType) {
        return type.name;
    }
    else if (type instanceof type_1.GraphQLNonNull) {
        return fieldToElm(type.ofType);
    }
    else if (type instanceof type_1.GraphQLList) {
        return 'List ' + fieldToElm(type.ofType); // todo: parentheses, if needed
    }
    else {
        throw new Error('unexpected field type ' + type.constructor);
    }
}
// entry point
var typeDecls = getTypeDecls(starWarsSchema_1.StarWarsSchema);
var elm = [];
for (var _i = 0, _a = Object.keys(typeDecls); _i < _a.length; _i++) {
    var name_1 = _a[_i];
    elm.push(typeDeclToElm(typeDecls[name_1]));
}
console.log(elm.join('\n\n'));
//# sourceMappingURL=elm-graphql.js.map