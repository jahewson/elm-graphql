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
  FragmentSpread,
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
      'Json.Encode exposing (encode)',
      'Http',
      'GraphQL exposing (apply, ID)'
    ], decls);
    fs.writeFileSync(outPath, elm);
  } else {
    throw new Error('HTTP status ' + res.statusCode);
  }
});

function translateQuery(uri: string, doc: Document, schema: GraphQLSchema): [Array<ElmDecl>, Array<string>] {
  let seenEnums: { [name: string]: GraphQLEnumType } = {};
  let expose: Array<string> = [];
  let fragmentDefinitionMap: { [name: string]: FragmentDefinition } = {};
  let seenFragments: { [name: string]: FragmentDefinition } = {};

  function walkQueryDocument(doc: Document, info: TypeInfo): [Array<ElmDecl>, Array<string>] {
    let decls: Array<ElmDecl> = [];
    decls.push({ name: 'endpointUrl', parameters: [], returnType: 'String', body: { expr: `"${uri}"` } });

    for (let def of doc.definitions) {
      if (def.kind == 'OperationDefinition') {
        decls.push(...walkOperationDefinition(<OperationDefinition>def, info));
      } else if (def.kind == 'FragmentDefinition') {
        decls.push(...walkFragmentDefinition(<FragmentDefinition>def, info));
      }
    }

    for (let name in seenEnums) {
      let seenEnum = seenEnums[name];
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
    if (!info.getType()) {
      throw new Error(`GraphQL schema does not define ${def.operation} '${def.name.value}'`);
    }
    seenFragments = {};
    if (def.operation == 'query' || def.operation == 'mutation') {
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
      let parameters: Array<{name:string, type:string, schemaType:GraphQLType, hasDefault:boolean}> = [];
      for (let varDef of def.variableDefinitions) {
        let name = varDef.variable.name.value;
        let schemaType = typeFromAST(schema, varDef.type);
        let type = inputTypeToString(schemaType);
        parameters.push({ name, type, schemaType, hasDefault: varDef.defaultValue != null });
      }
      let funcName = name[0].toLowerCase() + name.substr(1);
      // include all fragment dependencies in the query
      let query = '';
      for (let name in seenFragments) {
        query += print(seenFragments[name]) + ' ';
      }
      query += print(def);
      let decodeFuncName = resultType[0].toLowerCase() + resultType.substr(1);
      expose.push(funcName);
      expose.push(resultType);

      let parametersRecord = {
        name: 'params',
        type: '{ ' + parameters.map(p => p.name + ': ' +  inputTypeToString(p.schemaType)).join(', ') + ' }'
      };

      decls.push({
         name: funcName, parameters: [parametersRecord],
         returnType: `Task Http.Error ${resultType}`,
         body: {
           // we use awkward variable names to avoid naming collisions with query parameters
           expr: `let graphQLQuery = """${query.replace(/\s+/g, ' ')}""" in\n` +
             `    let graphQLParams =\n` +
             `            Json.Encode.object\n` +
             `                [ ` +
             parameters.map(p => {
               let encoder: string;
               if (p.hasDefault) {
                 encoder =`case params.${p.name} of` +
                     `\n                            Just val -> ${encoderForType(p.schemaType)} val` +
                     `\n                            Nothing -> Json.Encode.null`
               } else {
                 encoder = encoderForType(p.schemaType) + ' params.' + p.name;
               }
                return `("${p.name}", ${encoder})`;
             })
             .join(`\n                , `) + '\n' +
             `                ]\n` +
             `    in\n` +
             `    GraphQL.query endpointUrl graphQLQuery "${name}" (encode 0 graphQLParams) ${decodeFuncName}`
         }
       });
      decls.push({
         name: decodeFuncName, parameters: [],
         returnType: 'Decoder ' + resultType,
         body: decoderForQuery(def, info, schema, seenEnums, fragmentDefinitionMap) });

      info.leave(def);
      return decls;
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

  function walkFragmentDefinition(def: FragmentDefinition, info: TypeInfo): Array<ElmDecl> {
    info.enter(def);

    let name = def.name.value;
    fragmentDefinitionMap[name] = def;

    let decls: Array<ElmDecl> = [];
    let resultType = name[0].toUpperCase() + name.substr(1) + 'Result';

    // todo: Directives

    // SelectionSet
    let fields = walkSelectionSet(def.selectionSet, info);
    decls.push({ name: resultType, fields });

    info.leave(def);
    return decls;
  }

  function walkSelectionSet(selSet: SelectionSet, info: TypeInfo): Array<ElmField> {
    info.enter(selSet);
    let fields = [];
    let spreads = [];

    for (let sel of selSet.selections) {
      if (sel.kind == 'Field') {
        let field = <Field>sel;
        fields.push(walkField(field, info));
      } else if (sel.kind == 'FragmentSpread') {
        spreads.push((<FragmentSpread>sel).name.value);
      } else if (sel.kind == 'InlineFragment') {
        // todo: InlineFragment
        throw new Error('not implemented: InlineFragment');
      }
    }

    // expand out all fragment spreads
    for (let spreadName of spreads) {
      let def = fragmentDefinitionMap[spreadName];
      seenFragments[spreadName] = def;
      let spreadFields = walkSelectionSet(def.selectionSet, info);
      fields = [...fields, ...spreadFields];
    }

    info.leave(selSet);
    return fields;
  }

  function walkField(field: Field, info: TypeInfo): ElmField {
    info.enter(field);
    // Name
    let name = field.name.value;
    // Alias
    if (field.alias) {
      name = field.alias.value;
    }
    // todo: Arguments, such as `id: $someId`, where $someId is a variable
    let args = field.arguments; // e.g. id: "1000"
    // todo: Directives
    // SelectionSet
    if (field.selectionSet) {
      let isList = info.getType() instanceof GraphQLList;
      let fields = walkSelectionSet(field.selectionSet, info);
      info.leave(field);
      return { name, fields, list: isList };
    } else {
      if (!info.getType()) {
        throw new Error('Unknown GraphQL field: ' + field.name.value);
      }
      let type = leafTypeToString(info.getType());
      info.leave(field);
      return { name, type };
    }
  }
  
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
      return prefix + type.name;
    } else if (type instanceof GraphQLEnumType) {
      seenEnums[type.name] = type;
      return prefix + type.name;
    } else {
      throw new Error('not a leaf type: ' + (<any>type).name);
    }
  }

  // input types are defined in the query, not the schema
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
      seenEnums[type.name] = type;
      return prefix + type.name;
    } else if (type instanceof GraphQLScalarType) {
      return prefix + type.name;
    } else {
      throw new Error('not a leaf type: ' + (<any>type.constructor).name);
    }
  }

  return walkQueryDocument(doc, new TypeInfo(schema));
}
