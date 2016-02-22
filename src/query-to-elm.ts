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

/// <reference path="../typings/node.d.ts" />
/// <reference path="../typings/request.d.ts" />
/// <reference path="../typings/graphql-types.d.ts" />
/// <reference path="../typings/graphql-language.d.ts" />
/// <reference path="../typings/graphql-utilities.d.ts" />

import * as fs from 'fs';
import * as request from 'request';

import {
  OperationDefinition,
  FragmentDefinition,
  SelectionSet,
  Field,
  Document,
  parse
} from "graphql/language";

import {
  ElmField,
  ElmDecl,
  ElmType,
  ElmParameter,
  moduleToElm
} from './elm-ast';

import {
  GraphQLSchema,
  GraphQLNonNull,
  GraphQLList,
  GraphQLScalarType,
  GraphQLEnumType,
  GraphQLType,
  GraphQLInputType
} from 'graphql/type';

import {
  TypeInfo,
  buildClientSchema,
  introspectionQuery,
  typeFromAST,
} from 'graphql/utilities';

let uri = process.argv[2] || 'http://localhost:8080/graphql';
let moduleName = process.argv[3] || 'StarWars';
let graphqlFile = process.argv[4] || './src/queries.graphql';

let queries = fs.readFileSync(graphqlFile, 'utf8');
let queryDocument = parse(queries);

let url = uri + '?query=' + introspectionQuery.replace(/\n/g, '');
request(url, function (err, res, body) {
  if (err) {
    throw new Error(err);
  } else if (res.statusCode == 200) {
    let result = JSON.parse(body);
    let schema = buildClientSchema(result.data);
    let decls = translateQuery(queryDocument, schema);
    console.log(moduleToElm(moduleName, ['GraphQL'], decls));
  } else {
    throw new Error('HTTP status ' + res.statusCode);
  }
});

function translateQuery(doc: Document, schema: GraphQLSchema): Array<ElmDecl> {
  let seenEnums: Array<GraphQLEnumType> = [];

  function walkQueryDocument(doc: Document, info: TypeInfo): Array<ElmDecl> {
    let decls = [];

    for (let def of doc.definitions) {
      if (def.kind == 'OperationDefinition') {
        decls.push(...walkOperationDefinition(<OperationDefinition>def, info));
      } else if (def.kind == 'FragmentDefinition') {
        decls.push(walkFragmentDefinition(<FragmentDefinition>def, info));
      }
    }

    for (let seenEnum of seenEnums) {
      decls.unshift(walkEnum(seenEnum));
    }

    return decls;
  }

  function walkEnum(enumType: GraphQLEnumType): ElmType {
    return { name: enumType.name, constructors: enumType.getValues().map(v => v.name) };
  }

  function walkOperationDefinition(def: OperationDefinition, info: TypeInfo): Array<ElmDecl> {
    info.enter(def);
    if (def.operation == 'query') {
      let decls: Array<ElmDecl> = [];
      // Name
      let name: string;
      if (def.name) {
        name = def.name.value;
      } else {
        name = 'AnonymousQuery';
      }
      let resultType = name[0].toUpperCase() + name.substr(1) + 'Result';
      // todo: Directives
      // SelectionSet
      let fields = walkSelectionSet(def.selectionSet, info);
      decls.push({ name: resultType, fields });
      // VariableDefinition
      let parameters: Array<ElmParameter> = [];
      for (let varDef of def.variableDefinitions) {
        let name = varDef.variable.name.value;
        let type = inputTypeToString(typeFromAST(schema, varDef.type));
        // todo: default value
        parameters.push({ name, type });
      }
      if (parameters.length > 0) {
        let funcName = name[0].toLowerCase() + name.substr(1);
        decls.push({ name: funcName, parameters,
                     returnType: 'Task Http.Error ' + resultType, // todo: may not make HTTP req.
                     body: 'GraphQL.query "queryFriends" [id]' });
      }
      info.leave(def);
      return decls;
    } else if (def.operation == 'mutation') {
      // todo: mutation
    }
  }

  function walkFragmentDefinition(def: FragmentDefinition, info: TypeInfo) {
    console.log('todo: walkFragmentDefinition', def);
    // todo: FragmentDefinition
    return null;
  }

  function walkSelectionSet(selSet: SelectionSet, info: TypeInfo): Array<ElmField> {
    info.enter(selSet);
    let fields = [];
    for (let sel of selSet.selections) {
      if (sel.kind == 'Field') {
        let field = <Field>sel;
        fields.push(walkField(field, info));
      } else if (sel.kind == 'FragmentSpread') {
        // todo: FragmentSpread
        throw new Error('not implemented');
      } else if (sel.kind == 'InlineFragment') {
        // todo: InlineFragment
        throw new Error('not implemented');
      }
    }
    info.leave(selSet);
    return fields;
  }

  function walkField(field: Field, info: TypeInfo): ElmField {
    info.enter(field);
    // todo: Alias
    // Name
    let name = field.name.value;
    // Arguments (opt)
    let args = field.arguments; // e.g. id: "1000"
    // todo: Directives
    // SelectionSet
    if (field.selectionSet) {
      let fields = walkSelectionSet(field.selectionSet, info);
      info.leave(field);
      return { name, fields };
    } else {
      let type = leafTypeToString(info.getType());
      info.leave(field);
      return { name, type };
    }
  }

  // fixme: return an AST instead
  function leafTypeToString(type: GraphQLType): string {
    let prefix = '';

    // lists or non-null of leaf types only
    if (type instanceof GraphQLList) {
      type = type.ofType;
      prefix = 'List ';
    } else if (type instanceof GraphQLNonNull) {
      type = type.ofType;
    } else {
      // implicitly nullable
      prefix = 'Maybe ';
    }

    // leaf types only
    if (type instanceof GraphQLScalarType) {
      return prefix + type.name; // todo: ID type
    } else if (type instanceof GraphQLEnumType) {
      seenEnums.push(type);
      return prefix + type.name;
    } else {
      throw new Error('not a leaf type: ' + type.name);
    }
  }

  // input types are defined in the query, not the schema
  // fixme: return an AST instead
  function inputTypeToString(type: GraphQLInputType): string {
    let prefix = '';

    // lists or non-null of leaf types only
    if (type instanceof GraphQLList) {
      type = type.ofType;
      prefix = 'List ';
    } else if (type instanceof GraphQLNonNull) {
      type = type.ofType;
    } else {
      // implicitly nullable
      prefix = 'Maybe ';
    }

    if (type instanceof GraphQLEnumType) {
      seenEnums.push(type);
      return prefix + type.name;
    } else if (type instanceof GraphQLScalarType) {
      return prefix + type.name;
    } else {
      throw new Error('not a leaf type: ' + type.constructor.name);
    }
  }

  return walkQueryDocument(doc, new TypeInfo(schema));
}
