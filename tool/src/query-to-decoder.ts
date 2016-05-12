/**
 * Copyright (c) 2016, John Hewson
 * All rights reserved.
 */

/// <reference path="../typings/graphql-types.d.ts" />
/// <reference path="../typings/graphql-language.d.ts" />
/// <reference path="../typings/graphql-utilities.d.ts" />

import {
  OperationDefinition,
  FragmentDefinition,
  FragmentSpread,
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
  moduleToElm, ElmExpr
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

export function decoderForQuery(def: OperationDefinition, info: TypeInfo,
                                schema: GraphQLSchema, seenEnums: { [name: string]: GraphQLEnumType },
                                fragmentDefinitionMap: { [name: string]: FragmentDefinition }): ElmExpr {

  function walkOperationDefinition(def: OperationDefinition, info: TypeInfo): ElmExpr {
    info.enter(def);
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
      let expr = walkSelectionSet(def.selectionSet, info);
      //decls.push({ name: resultType, fields });
      // VariableDefinition
      let parameters: Array<ElmParameter> = [];
      for (let varDef of def.variableDefinitions) {
        let name = varDef.variable.name.value;
        let type = inputTypeToString(typeFromAST(schema, varDef.type));
        // todo: default value
        parameters.push({ name, type });
      }
      info.leave(def);
      //return decls;
      return { expr: 'map ' + resultType + ' ' + expr.expr };
    }
  }

  function walkSelectionSet(selSet: SelectionSet, info: TypeInfo): ElmExpr {
    info.enter(selSet);
    let fields = [];
    for (let sel of selSet.selections) {
      if (sel.kind == 'Field') {
        let field = <Field>sel;
        fields.push(walkField(field, info));
      } else if (sel.kind == 'FragmentSpread') {
        // expand out all fragment spreads
        let spreadName = (<FragmentSpread>sel).name.value;
        let def = fragmentDefinitionMap[spreadName];
        fields.push(walkSelectionSet(def.selectionSet, info));
      } else if (sel.kind == 'InlineFragment') {
        // todo: InlineFragment
        throw new Error('not implemented: InlineFragment');
      }
    }
    info.leave(selSet);
    return { expr: fields.map(f => f.expr).join('\n        `apply` ') }
  }

  function getSelectionSetFields(selSet: SelectionSet, info: TypeInfo): Array<String> {
    info.enter(selSet);
    let fields = [];
    for (let sel of selSet.selections) {
      if (sel.kind == 'Field') {
        let field = <Field>sel;
        let name = field.name.value;
        if (field.alias) {
          name = field.alias.value;
        }
        fields.push(name);
      } else if (sel.kind == 'FragmentSpread') {
        // expand out all fragment spreads
        let spreadName = (<FragmentSpread>sel).name.value;
        let def = fragmentDefinitionMap[spreadName];
        fields = [...fields, ...getSelectionSetFields(def.selectionSet, info)];
      } else if (sel.kind == 'InlineFragment') {
        // todo: InlineFragment
        throw new Error('not implemented: InlineFragment');
      }
    }
    info.leave(selSet);
    return fields;
  }

  function walkField(field: Field, info: TypeInfo): ElmExpr {
    info.enter(field);
    // Name
    let name = field.name.value;
    // Alias
    if (field.alias) {
      name = field.alias.value;
    }
    // Arguments (opt)
    let args = field.arguments; // e.g. id: "1000"
    // todo: Directives
    // SelectionSet
    if (field.selectionSet) {
      let prefix = '';
      if (info.getType() instanceof GraphQLList) {
        prefix = 'list ';
      }

      let fields = walkSelectionSet(field.selectionSet, info);
      info.leave(field);
      //return { name, fields };
      let fieldNames = getSelectionSetFields(field.selectionSet, info);
      let shape = `(\\${fieldNames.join(' ')} -> { ${fieldNames.map(f => f + ' = ' + f).join(', ')} })`;
      let left = '("' + name + '" :=\n';
      let right = '(map ' + shape + ' ' + fields.expr + '))';
      let indent = '        ';
      if (prefix) {
        return { expr: left + indent + '(' + prefix + right + ')' };
      } else {
        return { expr: left + indent + right };
      }
    } else {
      let isMaybe = !(info.getType() instanceof GraphQLList ||
                      info.getType() instanceof GraphQLNonNull);
      let type = leafTypeToString(info.getType());
      info.leave(field);
      //return { name, type };
      let expr = { expr: '("' + name + '" := ' + type +')' };
      if (isMaybe) {
        expr = { expr: '(maybe ' + expr.expr + ')' };
      }
      return expr;
    }
  }

  function leafTypeToString(type: GraphQLType): string {
    let prefix = '';

    // lists or non-null of leaf types only
    let t: GraphQLType;
    if (type instanceof GraphQLList) {
      t = type.ofType;
      prefix = 'list ';
    } else if (type instanceof GraphQLNonNull) {
      t = type.ofType;
    } else {
      // implicitly nullable
      //prefix = 'Maybe ';
      t = type;
    }
    type = t;

    // leaf types only
    if (type instanceof GraphQLScalarType) {
      if (type.name == 'ID') {
        return prefix + 'string';
      } else {
        return prefix + type.name.toLowerCase();
      }
    } else if (type instanceof GraphQLEnumType) {
      return prefix + type.name.toLowerCase();
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
      return prefix + type.name;
    } else if (type instanceof GraphQLScalarType) {
      return prefix + type.name;
    } else {
      throw new Error('not a leaf type: ' + (<any>type.constructor).name);
    }
  }

  return walkOperationDefinition(def, info);
}
