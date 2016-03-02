/**
 * Copyright (c) 2016, John Hewson
 * All rights reserved.
 */

/// <reference path="../typings/node.d.ts" />
/// <reference path="../typings/request.d.ts" />
/// <reference path="../typings/graphql-types.d.ts" />
/// <reference path="../typings/graphql-language.d.ts" />
/// <reference path="../typings/graphql-utilities.d.ts" />

import * as fs from 'fs';
import * as path from 'path';
import * as request from 'request';

import {
  OperationDefinition,
  FragmentDefinition,
  SelectionSet,
  Field,
  Document,
  parse,
  print
} from "graphql/language";

import {
  ElmField,
  ElmDecl,
  ElmType,
  ElmParameter,
  moduleToElm, ElmExpr, ElmFunction
} from './elm-ast';

import {
  GraphQLSchema,
  GraphQLNonNull,
  GraphQLList,
  GraphQLScalarType,
  GraphQLEnumType,
  GraphQLType,
  GraphQLObjectType
} from 'graphql/type';

import {
  TypeInfo,
  buildClientSchema,
  introspectionQuery,
  typeFromAST,
} from 'graphql/utilities';

import {
  decoderForQuery
} from './query-to-decoder';

let graphqlFile = process.argv[2];
if (!graphqlFile) {
  console.error('usage: query-to-elm graphql_file <endpoint_url>');
  process.exit(1);
}
let uri = process.argv[3] || 'http://localhost:8080/graphql';

let queries = fs.readFileSync(graphqlFile, 'utf8');
let queryDocument = parse(queries);

let basename = path.basename(graphqlFile);
let extname =  path.extname(graphqlFile);
let filename = basename.substr(0, basename.length - extname.length);
let moduleName = 'GraphQL.' + filename;

let outPath = path.join(path.dirname(graphqlFile), filename + '.elm');

let url = uri + '?query=' + introspectionQuery.replace(/\n/g, '');
request(url, function (err, res, body) {
  if (err) {
    throw new Error(err);
  } else if (res.statusCode == 200) {
    let result = JSON.parse(body);
    let schema = buildClientSchema(result.data);
    let [decls, expose] = translateQuery(uri, queryDocument, schema);
    let elm = moduleToElm(moduleName, expose, [
      'Task exposing (Task)',
      'Json.Decode exposing (..)',
      'Json.Encode exposing (encode, object)',
      'Http',
      'GraphQL exposing (apply)'
    ], decls);
    fs.writeFileSync(outPath, elm);
  } else {
    throw new Error('HTTP status ' + res.statusCode);
  }
});

function translateQuery(uri: string, doc: Document, schema: GraphQLSchema): [Array<ElmDecl>, Array<string>] {
  let seenEnums: Array<GraphQLEnumType> = [];
  let expose: Array<string> = [];

  function walkQueryDocument(doc: Document, info: TypeInfo): [Array<ElmDecl>, Array<string>] {
    let decls: Array<ElmDecl> = [];
    decls.push({ name: 'url', parameters: [], returnType: 'String', body: { expr: `"${uri}"` } });

    for (let def of doc.definitions) {
      if (def.kind == 'OperationDefinition') {
        decls.push(...walkOperationDefinition(<OperationDefinition>def, info));
      } else if (def.kind == 'FragmentDefinition') {
        decls.push(walkFragmentDefinition(<FragmentDefinition>def, info));
      }
    }

    for (let seenEnum of seenEnums) {
      decls.unshift(walkEnum(seenEnum));
      decls.push(decoderForEnum(seenEnum));
      expose.push(seenEnum.name);
    }

    return [decls, expose];
  }

  function walkEnum(enumType: GraphQLEnumType): ElmType {
    return { name: enumType.name, constructors: enumType.getValues().map(v => v.name) };
  }

  function decoderForEnum(enumType: GraphQLEnumType): ElmFunction {
    // might need to be Maybe Episode, with None -> fail in the Decoder
    return { name: enumType.name.toLowerCase(), parameters: [],
             returnType: 'Decoder ' + enumType.name,
             body: { expr: 'customDecoder string (\\s ->\n' +
               '        case s of\n' + enumType.getValues().map(v =>
               '            "' + v.name + '" -> Ok ' + v.name).join('\n') + '\n' +
               '            _ -> Err "Unknown ' + enumType.name + '")'
             }
           }
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
      let parameters: Array<{name:string, type:string, schemaType:GraphQLType}> = [];
      for (let varDef of def.variableDefinitions) {
        let name = varDef.variable.name.value;
        let schemaType = typeFromAST(schema, varDef.type);
        let type = inputTypeToString(schemaType);
        // todo: default value
        parameters.push({ name, type, schemaType });
      }
      let funcName = name[0].toLowerCase() + name.substr(1);
      let query = print(def);
      let decodeFuncName = resultType[0].toLowerCase() + resultType.substr(1);
      expose.push(funcName);
      expose.push(resultType);
      decls.push({
         name: funcName, parameters,
         returnType: `Task Http.Error ${resultType}`,
         body: {
           expr: `let query = """${query.replace(/\s+/g, ' ')}""" in\n` +
             `    let params =\n` +
             `            object\n` +
             `                [ ` +
             parameters.map(p => `("${p.name}", ${encoderForType(p.schemaType)} ${p.name})`)
                                  .join(`\n                , `) + '\n' +
             `                ]\n` +
             `    in\n` +
             `    GraphQL.query url query "${name}" (encode 0 params) ${decodeFuncName}`
         }
       });
      decls.push({
         name: decodeFuncName, parameters: [],
         returnType: 'Decoder ' + resultType,
         body: decoderForQuery(def, info, schema, seenEnums) });

      info.leave(def);
      return decls;
    } else if (def.operation == 'mutation') {
      // todo: mutation
    }
  }

  function encoderForType(type: GraphQLType): string {
    if (type instanceof GraphQLObjectType) {
      let fieldEncoders = [];
      let fields = type.getFields();
      for (let name in fields) {
        let f = fields[name];
        fieldEncoders.push(`("${f.name}", ${encoderForType(f.type)} ${f.name})`);
      }
      return '(object [' + fieldEncoders.join(`, `) + '])';
    } else if (type instanceof GraphQLList) {
      return 'list ' + encoderForType(type.ofType);
    } else if (type instanceof GraphQLNonNull) {
      return encoderForType(type.ofType);
    } else if (type instanceof GraphQLScalarType) {
      return 'Json.Encode.' + type.name.toLowerCase();
    }  else {
      throw new Error('not implemented: ' + (<any>type.constructor).name); // todo: what?
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
      let isList = info.getType() instanceof GraphQLList;
      let fields = walkSelectionSet(field.selectionSet, info);
      info.leave(field);
      return { name, fields, list: isList };
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
    let t: GraphQLType;
    if (type instanceof GraphQLList) {
      t = type.ofType;
      prefix = 'List ';
    } else if (type instanceof GraphQLNonNull) {
      t = type.ofType;
    } else {
      // implicitly nullable
      prefix = 'Maybe ';
      t = type;
    }
    type = t;

    // leaf types only
    if (type instanceof GraphQLScalarType) {
      return prefix + type.name; // todo: ID type
    } else if (type instanceof GraphQLEnumType) {
      seenEnums.push(type);
      return prefix + type.name;
    } else {
      throw new Error('not a leaf type: ' + (<any>type).name);
    }
  }

  // input types are defined in the query, not the schema
  // fixme: return an AST instead
  function inputTypeToString(type: GraphQLType): string {
    let prefix = '';

    // lists or non-null of leaf types only
    if (type instanceof GraphQLList) {
      type = (<any>type).ofType;
      prefix = 'List ';
    } else if (type instanceof GraphQLNonNull) {
      type =  (<any>type).ofType;
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
      throw new Error('not a leaf type: ' + (<any>type.constructor).name);
    }
  }

  return walkQueryDocument(doc, new TypeInfo(schema));
}
