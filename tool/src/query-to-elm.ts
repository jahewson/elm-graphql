/**
 * Copyright (c) 2016, John Hewson
 * All rights reserved.
 */

/// <reference path="../typings/node.d.ts" />
/// <reference path="../typings/es6-function.d.ts" />
/// <reference path="../typings/request.d.ts" />
/// <reference path="../typings/graphql-types.d.ts" />
/// <reference path="../typings/graphql-language.d.ts" />
/// <reference path="../typings/graphql-utilities.d.ts" />
/// <reference path="../typings/command-line-args.d.ts" />

import 'source-map-support/register';
import * as fs from 'fs';
import * as path from 'path';
import * as request from 'request';
import * as commandLineArgs from 'command-line-args';

import {
  Definition,
  OperationDefinition,
  FragmentDefinition,
  FragmentSpread,
  SelectionSet,
  Field,
  Document,
  Type,
  parse,
  print,
  visit
} from "graphql/language";

import {
  ElmFieldDecl,
  ElmDecl,
  ElmTypeDecl,
  ElmParameterDecl,
  moduleToString,
  ElmExpr,
  ElmFunctionDecl,
  ElmType,
  ElmTypeName,
  ElmTypeRecord,
  ElmTypeApp,
  ElmTypeAliasDecl
} from './elm-ast';

import {
  GraphQLSchema,
  GraphQLNonNull,
  GraphQLList,
  GraphQLScalarType,
  GraphQLEnumType,
  GraphQLType,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLInputObjectType
} from 'graphql/type';

import {
  TypeInfo,
  buildClientSchema,
  introspectionQuery,
  typeFromAST,
} from 'graphql/utilities';

import {
  decoderForQuery,
  decoderForFragment
} from './query-to-decoder';

let optionDefinitions = [
  {name: "method", alias: "m", type: String},
  {name: "args", type: String, multiple: true, defaultOption: true}
];

let options = commandLineArgs(optionDefinitions);

export type GraphQLEnumMap = { [name: string]: GraphQLEnumType };
export type GraphQLTypeMap = { [name: string]: GraphQLType };
export type FragmentDefinitionMap = { [name: string]: FragmentDefinition };

let graphqlFile = options["args"][0];
if (!graphqlFile) {
  console.error('usage: query-to-elm graphql_file <introspection_endpoint_url> <live_endpoint_url>');
  process.exit(1);
}
let introspectionUrl = options["args"][1] || 'http://localhost:8080/graphql';
let liveUrl = options["args"][2] || introspectionUrl;

let queries = fs.readFileSync(graphqlFile, 'utf8');
let queryDocument = parse(queries);

let basename = path.basename(graphqlFile);
let extname =  path.extname(graphqlFile);
let filename = basename.substr(0, basename.length - extname.length);
let moduleName = 'GraphQL.' + filename;

let outPath = path.join(path.dirname(graphqlFile), filename + '.elm');

let url = introspectionUrl;
let data = {query: introspectionQuery.replace(/\n/g, '')};
let method = options["method"] || "GET";
let reqopts = method == "GET" ? {url:url, method:method, qs:data}
                              : {url:url, method:method,
                                 headers: [{"Content-Type": "application/json"}],
                                 body: JSON.stringify(data)};
request(reqopts, function (err, res, body) {
  if (err) {
    throw new Error(err);
  } else if (res.statusCode == 200) {
    let result = JSON.parse(body);
    let schema = buildClientSchema(result.data);
    let [decls, expose] = translateQuery(liveUrl, queryDocument, schema);
    let elm = moduleToString(moduleName, expose, [
      'Task exposing (Task)',
      'Json.Decode exposing (..)',
      'Json.Encode exposing (encode)',
      'Http',
      'GraphQL exposing (apply, maybeEncode, ID)'
    ], decls);
    fs.writeFileSync(outPath, elm);
  } else {
    throw new Error('HTTP status ' + res.statusCode);
  }
});

function translateQuery(uri: string, doc: Document, schema: GraphQLSchema): [Array<ElmDecl>, Array<string>] {
  //let seenEnums: GraphQLEnumMap = {};
  let expose: Array<string> = [];
  let fragmentDefinitionMap: FragmentDefinitionMap = {};

  function walkQueryDocument(doc: Document, info: TypeInfo): [Array<ElmDecl>, Array<string>] {
    let decls: Array<ElmDecl> = [];
    decls.push(new ElmFunctionDecl('endpointUrl', [], new ElmTypeName('String'), { expr: `"${uri}"` }));

    buildFragmentDefinitionMap(doc);
    let seenFragments: FragmentDefinitionMap = {};
    let seenEnums: GraphQLEnumMap = {};

    for (let def of doc.definitions) {
      if (def.kind == 'OperationDefinition') {
        decls.push(...walkOperationDefinition(<OperationDefinition>def, info));
      } else if (def.kind == 'FragmentDefinition') {
        decls.push(...walkFragmentDefinition(<FragmentDefinition>def, info));
      }
      collectFragments(def, seenFragments);
      collectEnums(def, seenEnums);
    }

    for (let fragName in seenFragments) {
      let frag = seenFragments[fragName];
      let decodeFragFuncName = fragName[0].toLowerCase() + fragName.substr(1);
      let fragTypeName = fragName[0].toUpperCase() + fragName.substr(1) + 'Result';
      decls.push(new ElmFunctionDecl(
              decodeFragFuncName, [],
              new ElmTypeName('Decoder ' + fragTypeName),
              decoderForFragment(frag, info, schema, fragmentDefinitionMap, seenFragments) ));
      expose.push(decodeFragFuncName);
      expose.push(fragTypeName);
    }

    for (let name in seenEnums) {
      let seenEnum = seenEnums[name];
      decls.unshift(walkEnum(seenEnum));
      decls.push(decoderForEnum(seenEnum));
      expose.push(seenEnum.name);
    }

    return [decls, expose];
  }

  function buildFragmentDefinitionMap(doc: Document): void {
    visit(doc, {
      enter: function(node) {
        if (node.kind == 'FragmentDefinition') {
          let def = <FragmentDefinition>node;
          let name = def.name.value;
          fragmentDefinitionMap[name] = def;
        }
      },
      leave: function(node) {}
    });
  }

  function collectFragments(def: Definition, fragments: FragmentDefinitionMap = {}): FragmentDefinitionMap {
    visit(doc, {
      enter: function(node) {
        if (node.kind == 'FragmentSpread') {
          let spread = <FragmentSpread>node;
          let name = spread.name.value;
          fragments[name] = fragmentDefinitionMap[name];
        }
      },
      leave: function(node) {}
    });
    return fragments;
  }
  
  function collectEnums(def: Definition, enums: GraphQLEnumMap = {}): GraphQLEnumMap {
    let info = new TypeInfo(schema);
    visit(doc, {
      enter: function(node, key, parent) {
        info.enter(node);
        if (node.kind == 'Field') {
          let field = <Field>node;
          let name = field.name.value;
          let type = info.getType();
          collectEnumsForType(type, enums);
        }
        // todo: do we need to walk into fragment spreads?
      },
      leave: function(node, key, parent) {
        info.leave(node);
      }
    });
    return enums;
  }

  function collectEnumsForType(type: GraphQLType, seen: GraphQLEnumMap = {}, seenTypes: GraphQLTypeMap = {}): void {
    if (type instanceof GraphQLEnumType) {
      seen[type.name] = type;
    } else if (type instanceof GraphQLList) {
      collectEnumsForType(type.ofType, seen, seenTypes);
    } else if (type instanceof GraphQLObjectType ||
               type instanceof GraphQLInterfaceType ||
               type instanceof GraphQLInputObjectType) {
      if (seenTypes[type.name]) {
        return;
      } else {
        seenTypes[type.name] = type;
      }
      let fieldMap = type.getFields();
      for (let fieldName in fieldMap) {
        let field = fieldMap[fieldName];
        collectEnumsForType(field.type, seen, seenTypes)
      }
    } else if (type instanceof GraphQLNonNull) {
      collectEnumsForType(type.ofType, seen, seenTypes);
    }
  }

  function walkEnum(enumType: GraphQLEnumType): ElmTypeDecl {
    return new ElmTypeDecl(enumType.name, enumType.getValues().map(v => v.name[0].toUpperCase() + v.name.substr(1)));
  }

  function decoderForEnum(enumType: GraphQLEnumType): ElmFunctionDecl {
    // might need to be Maybe Episode, with None -> fail in the Decoder
    let decoderTypeName = enumType.name[0].toUpperCase() + enumType.name.substr(1);
    return new ElmFunctionDecl(enumType.name.toLowerCase(), [], new ElmTypeName('Decoder ' + decoderTypeName),
        { expr: 'customDecoder string (\\s ->\n' +
                '        case s of\n' + enumType.getValues().map(v =>
                '            "' + v.name + '" -> Ok ' + v.name[0].toUpperCase() + v.name.substr(1)).join('\n') + '\n' +
                '            _ -> Err "Unknown ' + enumType.name + '")'
              });
  }

  function walkOperationDefinition(def: OperationDefinition, info: TypeInfo): Array<ElmDecl> {
    info.enter(def);
    if (!info.getType()) {
      throw new Error(`GraphQL schema does not define ${def.operation} '${def.name.value}'`);
    }
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
      let [fields, spreads] = walkSelectionSet(def.selectionSet, info);
      // todo: use spreads...
      decls.push(new ElmTypeAliasDecl(resultType, new ElmTypeRecord(fields)))
      // VariableDefinition
      let parameters: Array<{name: string, type: ElmType, schemaType: GraphQLType, hasDefault:boolean}> = [];
      if (def.variableDefinitions) {
        for (let varDef of def.variableDefinitions) {
          let name = varDef.variable.name.value;
          let schemaType = typeFromAST(schema, varDef.type);
          let type = typeToElm(schemaType);
          parameters.push({ name, type, schemaType, hasDefault: varDef.defaultValue != null });
        }
      }
      let funcName = name[0].toLowerCase() + name.substr(1);
      // include all fragment dependencies in the query
      let seenFragments = collectFragments(def);
      let query = '';
      for (let name in seenFragments) {
        query += print(seenFragments[name]) + ' ';
      }
      query += print(def);
      let decodeFuncName = resultType[0].toLowerCase() + resultType.substr(1);
      expose.push(funcName);
      expose.push(resultType);

      let elmParamsType = new ElmTypeRecord(parameters.map(p => new ElmFieldDecl(p.name, p.type)));
      let elmParams = new ElmParameterDecl('params', elmParamsType);
      let elmParamsDecl = elmParamsType.fields.length > 0 ? [elmParams] : [];

      decls.push(new ElmFunctionDecl(
         funcName, elmParamsDecl, new ElmTypeName(`Task Http.Error ${resultType}`),
         {
           // we use awkward variable names to avoid naming collisions with query parameters
           expr: `let graphQLQuery = """${query.replace(/\s+/g, ' ')}""" in\n` +
             `    let graphQLParams =\n` +
             `            Json.Encode.object\n` +
             `                [ ` +
             parameters.map(p => {
              let encoder: string;
               if (p.hasDefault) {
                 encoder =`case params.${p.name} of` +
                     `\n                            Just val -> ${encoderForInputType(p.schemaType, true)} val` +
                     `\n                            Nothing -> Json.Encode.null`
               } else {
                 encoder = encoderForInputType(p.schemaType, true, 'params.' + p.name);
               }
               return `("${p.name}", ${encoder})`;
             })
             .join(`\n                , `) + '\n' +
             `                ]\n` +
             `    in\n` +
             `    GraphQL.${def.operation} endpointUrl graphQLQuery "${name}" (encode 0 graphQLParams) ${decodeFuncName}`
         }
      ));
      let resultTypeName = resultType[0].toUpperCase() + resultType.substr(1);
      decls.push(new ElmFunctionDecl(
         decodeFuncName, [],
         new ElmTypeName('Decoder ' + resultTypeName),
         decoderForQuery(def, info, schema, fragmentDefinitionMap, seenFragments) ));
      
      info.leave(def);
      return decls;
    }
  }

  function encoderForInputType(type: GraphQLType, isNonNull?: boolean, value?: string): string {
    let encoder: string;

    if (type instanceof GraphQLInputObjectType) {
      let fieldEncoders: Array<string> = [];
      let fields = type.getFields();
      for (let name in fields) {
        let field = fields[name];
        let valuePath = value + '.' + field.name;
        fieldEncoders.push(`("${field.name}", ${encoderForInputType(field.type, false, valuePath)})`);
      }
      encoder = '(Json.Encode.object [' + fieldEncoders.join(`, `) + '])';
    } else if (type instanceof GraphQLList) {
      encoder = '(Json.Encode.list (List.map (\\x -> ' + encoderForInputType(type.ofType, true, 'x') + ') ' + value + '))';
    } else if (type instanceof GraphQLNonNull) {
      encoder = encoderForInputType(type.ofType, true, value);
    } else if (type instanceof GraphQLScalarType) {
      switch (type.name) {
        case 'Int': encoder = 'Json.Encode.int ' + value; break;
        case 'Float': encoder = 'Json.Encode.float ' + value; break;
        case 'Boolean': encoder = 'Json.Encode.bool ' + value; break;
        case 'ID':
        case 'String': encoder = 'Json.Encode.string ' + value; break;
      }
    } else {
      throw new Error('not implemented: ' + type.constructor.name);
    }

    if (!isNonNull && !(type instanceof GraphQLList) && !(type instanceof GraphQLNonNull)) {
      encoder = '(maybeEncode ' + encoder + ')'
    }
    return encoder;
  }

  function walkFragmentDefinition(def: FragmentDefinition, info: TypeInfo): Array<ElmDecl> {
    info.enter(def);

    let name = def.name.value;

    let decls: Array<ElmDecl> = [];
    let resultType = name[0].toUpperCase() + name.substr(1) + 'Result';

    // todo: Directives

    // SelectionSet
    let [fields, spreads] = walkSelectionSet(def.selectionSet, info);
    let type: ElmType = new ElmTypeRecord(fields, 'a')
    for (let spreadName of spreads) {
      let typeName = spreadName[0].toUpperCase() + spreadName.substr(1) + 'Result_';
      type = new ElmTypeApp(typeName, type);
    }
    
    decls.push(new ElmTypeAliasDecl(resultType + '_', type, ['a']));
    decls.push(new ElmTypeAliasDecl(resultType, new ElmTypeApp(resultType + '_', new ElmTypeRecord([]))));

    info.leave(def);
    return decls;
  }

  function walkSelectionSet(selSet: SelectionSet, info: TypeInfo): [Array<ElmFieldDecl>, Array<string>] {
    info.enter(selSet);
    let fields: Array<ElmFieldDecl> = [];
    let spreads: Array<string> = [];

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

    info.leave(selSet);
    return [fields, spreads];
  }

  function walkField(field: Field, info: TypeInfo): ElmFieldDecl {
    info.enter(field);
    // Name
    let name = elmSafeName(field.name.value);
    // Alias
    if (field.alias) {
      name = elmSafeName(field.alias.value);
    }
    // todo: Arguments, such as `id: $someId`, where $someId is a variable
    let args = field.arguments; // e.g. id: "1000"
    // todo: Directives
    // SelectionSet
    if (field.selectionSet) {
      let isList = info.getType() instanceof GraphQLList;
      let [fields, spreads] = walkSelectionSet(field.selectionSet, info);
      // record
      let type: ElmType = new ElmTypeRecord(fields);
      // spreads
      for (let spreadName of spreads) {
        let typeName = spreadName[0].toUpperCase() + spreadName.substr(1) + 'Result_';
        type = new ElmTypeApp(typeName, type);
      }
      // list
      if (isList) {
        type = new ElmTypeApp('List', type);
      }
      info.leave(field);
      return new ElmFieldDecl(name, type)
    } else {
      if (!info.getType()) {
        throw new Error('Unknown GraphQL field: ' + field.name.value);
      }
      let type = typeToElm(info.getType());
      info.leave(field);
      return new ElmFieldDecl(name, type)
    }
  }
  return walkQueryDocument(doc, new TypeInfo(schema));
}

export function typeToElm(type: GraphQLType, isNonNull = false): ElmType {
  let elmType: ElmType;
  
  if (type instanceof GraphQLScalarType) {
    switch (type.name) {
      case 'Int': elmType = new ElmTypeName('Int'); break;
      case 'Float': elmType = new ElmTypeName('Float'); break;
      case 'Boolean': elmType = new ElmTypeName('Bool'); break;
      case 'ID':
      case 'String': elmType = new ElmTypeName('String'); break;
    }
  } else if (type instanceof GraphQLEnumType) {
    elmType = new ElmTypeName(type.name[0].toUpperCase() + type.name.substr(1));
  } else if (type instanceof GraphQLList) {
    elmType = new ElmTypeApp('List', typeToElm(type.ofType, true));
  } else if (type instanceof GraphQLObjectType ||
             type instanceof GraphQLInterfaceType ||
             type instanceof GraphQLInputObjectType) {
    let fields: Array<ElmFieldDecl> = [];
    let fieldMap = type.getFields();
    for (let fieldName in fieldMap) {
      let field = fieldMap[fieldName];
      fields.push(new ElmFieldDecl(elmSafeName(fieldName), typeToElm(field.type)))
    }
    elmType = new ElmTypeRecord(fields);
  } else if (type instanceof GraphQLNonNull) {
    elmType = typeToElm(type.ofType, true);
  } else {
    throw new Error('Unexpected: ' + type.constructor.name);
  }

  if (!isNonNull && !(type instanceof GraphQLList) && !(type instanceof GraphQLNonNull)) {
    elmType = new ElmTypeApp('Maybe', elmType);
  }
  return elmType;
}

export function elmSafeName(graphQlName: string): string {
  switch (graphQlName) {
    case 'type': return "type'";
    // todo: more...
    default: return graphQlName;
  }
}
