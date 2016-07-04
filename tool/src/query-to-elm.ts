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

import 'source-map-support/register';
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
  print,
  visit
} from "graphql/language";

import {
  ElmFieldDecl,
  ElmDecl,
  ElmTypeDecl,
  ElmParameterDecl,
  moduleToElm,
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
  GraphQLObjectType
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

let url = uri + '?query=' + encodeURIComponent(introspectionQuery.replace(/\n/g, '')); 
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
    decls.push(new ElmFunctionDecl('endpointUrl', [], new ElmTypeName('String'), { expr: `"${uri}"` }));

    buildFragmentDefinitionMap(doc);

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

  function buildFragmentDefinitionMap(doc: Document) {
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
      let [fields, spreads] = walkSelectionSet(def.selectionSet, info);
      // todo: use spreads...
      decls.push(new ElmTypeAliasDecl(resultType, fields))
      // VariableDefinition
      let parameters: Array<{name: string, type: ElmType, schemaType: GraphQLType, hasDefault:boolean}> = [];
      if (def.variableDefinitions) {
        for (let varDef of def.variableDefinitions) {
          let name = varDef.variable.name.value;
          let schemaType = typeFromAST(schema, varDef.type);
          let type = walkInputType(schemaType);
          parameters.push({ name, type, schemaType, hasDefault: varDef.defaultValue != null });
        }
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
      ));
      let resultTypeName = resultType[0].toUpperCase() + resultType.substr(1);
      decls.push(new ElmFunctionDecl(
         decodeFuncName, [],
         new ElmTypeName('Decoder ' + resultTypeName),
         decoderForQuery(def, info, schema, seenEnums, fragmentDefinitionMap, seenFragments) ));

      for (let fragName in seenFragments) {
        let frag = seenFragments[fragName];
        let decodeFragFuncName = fragName[0].toLowerCase() + fragName.substr(1);
        let fragTypeName = fragName[0].toUpperCase() + fragName.substr(1) + 'Result';
        decls.push(new ElmFunctionDecl(
                decodeFragFuncName, [],
                new ElmTypeName('Decoder ' + fragTypeName),
                decoderForFragment(frag, info, schema, seenEnums, fragmentDefinitionMap, seenFragments) ));
        expose.push(decodeFragFuncName);
        expose.push(fragTypeName);
      }
      
      info.leave(def);
      return decls;
    }
  }

  function encoderForType(type: GraphQLType): string {
    if (type instanceof GraphQLObjectType) {
      let fieldEncoders: Array<string> = [];
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
      throw new Error('not implemented: ' + type.constructor.name); // todo: what?
    }
  }

  function walkFragmentDefinition(def: FragmentDefinition, info: TypeInfo): Array<ElmDecl> {
    info.enter(def);

    let name = def.name.value;

    let decls: Array<ElmDecl> = [];
    let resultType = name[0].toUpperCase() + name.substr(1) + 'Result';

    // todo: Directives

    // SelectionSet
    let [fields, spreads] = walkSelectionSet(def.selectionSet, info);
    // todo: use spreads
    decls.push(new ElmTypeAliasDecl(resultType + '_', fields, ['a']));
    decls.push(new ElmTypeAliasDecl(resultType, []));

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

    // expand out all fragment spreads
    for (let spreadName of spreads) {
      let def = fragmentDefinitionMap[spreadName];
      seenFragments[spreadName] = def;
    }

    info.leave(selSet);
    return [fields, spreads];    // todo: fragment spread needs to be applied to the outer
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
      // spreads - NEW!!!!!!
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
      let type = walkLeafType(info.getType());
      info.leave(field);
      return new ElmFieldDecl(name, type)
    }
  }
  
  function walkLeafType(type: GraphQLType): ElmType {
    // lists or non-null of leaf types only
    let isList = false;
    let isMaybe = false;
    let t: GraphQLType;
    if (type instanceof GraphQLList) {
      t = type.ofType;
      isList = true;
    } else if (type instanceof GraphQLNonNull) {
      t = type.ofType;
    } else {
      // implicitly nullable
      t = type;
      isMaybe = true; 
    }
    type = t;

    // leaf types only
    let inner: ElmType;
    if (type instanceof GraphQLScalarType) {
      inner = new ElmTypeName(type.name);
    } else if (type instanceof GraphQLEnumType) {
      seenEnums[type.name] = type;
      inner = new ElmTypeName(type.name[0].toUpperCase() + type.name.substr(1));
    } else {
      throw new Error('not a leaf type: ' + (<any>type).name);
    }

    if (isList) {
      inner = new ElmTypeApp('List', inner);
    } else if (isMaybe) {
      inner = new ElmTypeApp('Maybe', inner);
    }
    return inner;
  }

  // input types are defined in the query, not the schema
  function walkInputType(type: GraphQLType): ElmType {
    // todo: need to handle non-leaf types
    return walkLeafType(type);
  }

  return walkQueryDocument(doc, new TypeInfo(schema));
}

export function elmSafeName(graphQlName: string): string {
  switch (graphQlName) {
    case 'type': return "type'";
    // todo: more...
    default: return graphQlName;
  }
}
