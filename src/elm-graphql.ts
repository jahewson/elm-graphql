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

import {
  GraphQLSchema, GraphQLNonNull, GraphQLList, GraphQLScalarType, GraphQLObjectType,
  GraphQLInterfaceType, GraphQLEnumType
} from 'graphql/type';

import { StarWarsSchema } from './starWarsSchema';

/**
 * Returns a (name -> type) mapping of the top-level type declarations in a GraphQL schema.
 */
function getTypeDecls(schema) {
  let map = {};
  let queue = [schema._queryType];
  
  while (queue.length > 0) {
    let ty = queue.shift();
    
    // unpack lists and maybes (possibly recursive)
    while (ty instanceof GraphQLNonNull ||
           ty instanceof GraphQLList) {
      ty = ty.ofType;
    }
    
    // sanity check
    if (!ty.name) {
      throw new Error('should not happen');
    }
    
    // for non-scalars, check if we've seen it
    if (!(ty instanceof GraphQLScalarType)) {
      if (map[ty.name]) {
        continue;
      } else {
        // if not, store it
        map[ty.name] = ty;
      }
    }
    
    // recurse into the fields of object types
    if (ty instanceof GraphQLObjectType ||
        ty instanceof GraphQLInterfaceType) {
      let config = ty._typeConfig;
      let fields = config.fields instanceof Function ? config.fields() : config.fields;
      for (let k of Object.keys(fields)) {
        let t = fields[k].type;
        queue.push(t);
      }
    } else {
      if (!(ty instanceof GraphQLScalarType ||
            ty instanceof GraphQLEnumType)) {
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
  if (type instanceof GraphQLObjectType ||
      type instanceof GraphQLInterfaceType) {
    
    // extract the fields
    let config = type._typeConfig;
    let fields = config.fields instanceof Function ? config.fields() : config.fields;
    
    // map to Elm
    let elmFields = [];
    for (let k of Object.keys(fields)) {
      let fieldType = fields[k].type;
      let elmField = fieldToElm(fieldType);
      
      // most types are implicitly nullable
      if (!(fieldType instanceof GraphQLNonNull)) {
        if (elmField.indexOf(' ') > - 1) {
          elmField = 'Maybe (' + elmField + ')';
        } else {
          elmField = 'Maybe ' + elmField;
        }
      }
      elmFields.push(k + ' : ' + elmField);
    }
    return 'type alias ' + type.name + ' =\n' +
            '    { ' + elmFields.join('\n    , ') + '\n    }\n';
  } else if (type instanceof GraphQLEnumType) {
    return 'type ' + type.name + '\n' +
           '    = ' + type._values.map(v => v.name).join('\n    | ') + '\n';
  } else {
    throw new Error('unexpected top-level type ' + type.constructor);
  }
}

/**
 * Translates a GraphQL field type to Elm.
 */
function fieldToElm(type) {
  if (type instanceof GraphQLObjectType ||
      type instanceof GraphQLInterfaceType) {
    return type.name;
  } else if (type instanceof GraphQLScalarType) {
    switch (type.name) {
      case 'String': return 'String';
      case 'Boolean': return 'Boolean';
      default: throw new Error('unexpected scalar type ' + type.name);
    }
  } else if (type instanceof GraphQLEnumType) {
    return type.name;
  } else if (type instanceof GraphQLNonNull) {
    return fieldToElm(type.ofType);
  } else if (type instanceof GraphQLList) {
    return 'List ' + fieldToElm(type.ofType); // todo: parentheses, if needed
  } else {
    throw new Error('unexpected field type ' + type.constructor);
  }
}

// entry point
let typeDecls = getTypeDecls(StarWarsSchema);
let elm = [];
for (let name of Object.keys(typeDecls)) {
  elm.push(typeDeclToElm(typeDecls[name]));
}
console.log(elm.join('\n\n'));
