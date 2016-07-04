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
  ElmFieldDecl,
  ElmDecl,
  ElmTypeDecl,
  ElmParameterDecl,
  ElmExpr,
  moduleToString,
  typeToString
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

import {
  FragmentDefinitionMap,
  GraphQLEnumMap,
  elmSafeName,
  typeToElm
} from './query-to-elm';

export function decoderForQuery(def: OperationDefinition, info: TypeInfo,
                                schema: GraphQLSchema, seenEnums: GraphQLEnumMap,
                                fragmentDefinitionMap: FragmentDefinitionMap,
                                seenFragments: FragmentDefinitionMap): ElmExpr {
  return decoderFor(def, info, schema, seenEnums, fragmentDefinitionMap, seenFragments);
}

export function decoderForFragment(def: FragmentDefinition, info: TypeInfo,
                                schema: GraphQLSchema, seenEnums: GraphQLEnumMap,
                                fragmentDefinitionMap: FragmentDefinitionMap,
                                seenFragments: FragmentDefinitionMap): ElmExpr {
  return decoderFor(def, info, schema, seenEnums, fragmentDefinitionMap, seenFragments);
}


export function decoderFor(def: OperationDefinition | FragmentDefinition, info: TypeInfo,
                           schema: GraphQLSchema, seenEnums: GraphQLEnumMap,
                           fragmentDefinitionMap: FragmentDefinitionMap,
                           seenFragments: FragmentDefinitionMap): ElmExpr {

  function walkDefinition(def: OperationDefinition | FragmentDefinition, info: TypeInfo) {
    if (def.kind == 'OperationDefinition') {
      return walkOperationDefinition(<OperationDefinition>def, info);
    } else if (def.kind == 'FragmentDefinition') {
      return walkFragmentDefinition(<FragmentDefinition>def, info);
    }
  }

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
      let parameters: Array<ElmParameterDecl> = [];
      if (def.variableDefinitions) {
        for (let varDef of def.variableDefinitions) {
          let name = varDef.variable.name.value;

          let type = typeToString(typeToElm(typeFromAST(schema, varDef.type)), 0);
          // todo: default value
          parameters.push({ name, type });
        }
      }
      info.leave(def);
      //return decls;
      
      return { expr: 'map ' + resultType + ' ' + expr.expr };
    }
  }

  function walkFragmentDefinition(def: FragmentDefinition, info: TypeInfo): ElmExpr {
    info.enter(def);

    let name = def.name.value;

    let decls: Array<ElmDecl> = [];
    let resultType = name[0].toUpperCase() + name.substr(1) + 'Result';

    // todo: Directives

    // SelectionSet
    let fields = walkSelectionSet(def.selectionSet, info);

    let fieldNames = getSelectionSetFields(def.selectionSet, info);
    let shape = `(\\${fieldNames.join(' ')} -> { ${fieldNames.map(f => f + ' = ' + f).join(', ')} })`;
    
    info.leave(def);
    return { expr: 'map ' + shape + ' ' + fields.expr };
  }

  function walkSelectionSet(selSet: SelectionSet, info: TypeInfo): ElmExpr {
    info.enter(selSet);
    let fields: Array<ElmExpr> = [];
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

  function getSelectionSetFields(selSet: SelectionSet, info: TypeInfo): Array<string> {
    info.enter(selSet);
    let fields: Array<string> = [];
    for (let sel of selSet.selections) {
      if (sel.kind == 'Field') {
        let field = <Field>sel;
        let name = elmSafeName(field.name.value);
        if (field.alias) {
          name = elmSafeName(field.alias.value);
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
    let name = elmSafeName(field.name.value);
    let originalName = field.name.value;
    // Alias
    if (field.alias) {
      name = elmSafeName(field.alias.value);
      originalName = field.alias.value;
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
      let left = '("' + originalName + '" :=\n';
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
      let type = typeToString(typeToElm(info.getType()), 0);
      info.leave(field);
      //return { name, type };
      let expr = { expr: '("' + originalName + '" := ' + type +')' };
      if (isMaybe) {
        expr = { expr: '(maybe ' + expr.expr + ')' };
      }
      return expr;
    }
  }

  return walkDefinition(def, info);
}
