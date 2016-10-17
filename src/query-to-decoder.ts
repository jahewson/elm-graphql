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
  InlineFragment,
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
  GraphQLInputType,
  GraphQLUnionType
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
                                schema: GraphQLSchema, fragmentDefinitionMap: FragmentDefinitionMap,
                                seenFragments: FragmentDefinitionMap): ElmExpr {
  return decoderFor(def, info, schema, fragmentDefinitionMap, seenFragments);
}

export function decoderForFragment(def: FragmentDefinition, info: TypeInfo,
                                schema: GraphQLSchema, fragmentDefinitionMap: FragmentDefinitionMap,
                                seenFragments: FragmentDefinitionMap): ElmExpr {
  return decoderFor(def, info, schema, fragmentDefinitionMap, seenFragments);
}

export function decoderFor(def: OperationDefinition | FragmentDefinition, info: TypeInfo,
                           schema: GraphQLSchema, fragmentDefinitionMap: FragmentDefinitionMap,
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
      let resultType = name[0].toUpperCase() + name.substr(1);
      // todo: Directives
      // SelectionSet
      let expr = walkSelectionSet(def.selectionSet, info);
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
      
      return { expr: 'map ' + resultType + ' ' + expr.expr };
    }
  }

  function walkFragmentDefinition(def: FragmentDefinition, info: TypeInfo): ElmExpr {
    info.enter(def);

    let name = def.name.value;

    let decls: Array<ElmDecl> = [];
    let resultType = name[0].toUpperCase() + name.substr(1);

    // todo: Directives

    // SelectionSet
    let fields = walkSelectionSet(def.selectionSet, info);

    let fieldNames = getSelectionSetFields(def.selectionSet, info);
    let shape = `(\\${fieldNames.join(' ')} -> { ${fieldNames.map(f => f + ' = ' + f).join(', ')} })`;
    
    info.leave(def);
    return { expr: 'map ' + shape + ' ' + fields.expr };
  }

  function walkSelectionSet(selSet: SelectionSet, info: TypeInfo, seenFields: Array<string> = []): ElmExpr {
    info.enter(selSet);
    let fields: Array<ElmExpr> = [];
    for (let sel of selSet.selections) {
      if (sel.kind == 'Field') {
        let field = <Field>sel;
        if (seenFields.indexOf(field.name.value) == -1) {
          fields.push(walkField(field, info));
          seenFields.push(field.name.value);
        }
      } else if (sel.kind == 'FragmentSpread') {
        // expand out all fragment spreads
        let spreadName = (<FragmentSpread>sel).name.value;
        let def = fragmentDefinitionMap[spreadName];
        fields.push(walkSelectionSet(def.selectionSet, info, seenFields));
      } else if (sel.kind == 'InlineFragment') {
        throw new Error('Should not happen');
      }
    }
    info.leave(selSet);
    return { expr: fields.map(f => f.expr).filter(e => e.length > 0).join('\n        `apply` ') }
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
        if (fields.indexOf(name) == -1) {
          fields.push(name);
        }
      } else if (sel.kind == 'FragmentSpread') {
        // expand out all fragment spreads
        let spreadName = (<FragmentSpread>sel).name.value;
        let def = fragmentDefinitionMap[spreadName];
        for (let name of getSelectionSetFields(def.selectionSet, info)) {
          if (fields.indexOf(name) == -1) {
            fields.push(name);
          }
        }
      } else if (sel.kind == 'InlineFragment') {
        throw new Error('Should not happen');
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
    
    if (info.getType() instanceof GraphQLUnionType) {
      // Union
      return walkUnion(originalName, field, info);
    } else {
      // SelectionSet
      if (field.selectionSet) {
        let prefix = '';
        if (info.getType() instanceof GraphQLList) {
          prefix = 'list ';
        }

        let fields = walkSelectionSet(field.selectionSet, info);
        info.leave(field);
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
        let decoder = leafTypeToDecoder(info.getType());
        info.leave(field);
        let expr = { expr: '("' + originalName + '" := ' + decoder +')' };
        if (isMaybe) {
          expr = { expr: '(maybe ' + expr.expr + ')' };
        }
        return expr;
      }
    }
  }

  function walkUnion(originalName: string, field: Field, info: TypeInfo): ElmExpr {
    let decoder = '\n        (\\typename -> case typename of';
    let indent = '            ';

    for (let sel of field.selectionSet.selections) {
      if (sel.kind == 'InlineFragment') {
        let inlineFragment = <InlineFragment> sel;
        decoder += `\n${indent}"${inlineFragment.typeCondition.name.value}" -> `;

        info.enter(inlineFragment);
        let fields = walkSelectionSet(inlineFragment.selectionSet, info);
        info.leave(inlineFragment);
        let fieldNames = getSelectionSetFields(inlineFragment.selectionSet, info);
        let ctor = elmSafeName(inlineFragment.typeCondition.name.value);
        let shape = `(\\${fieldNames.join(' ')} -> ${ctor} { ${fieldNames.map(f => f + ' = ' + f).join(', ')} })`;
        let right = '(map ' + shape + ' ' + fields.expr + ')';
        decoder += right;

      } else if (sel.kind == 'Field') {
        let field = <Field>sel;
        if (field.name.value != '__typename') {
          throw new Error('Unexpected field: ' + field.name.value);
        }
      } else {
        throw new Error('Unexpected: ' + sel.kind);
      }
    }

    decoder += `\n${indent}_ -> fail "Unexpected union type")`;

    decoder = '(("__typename" := string) `andThen` ' + decoder + ')';
    return { expr: '("' + originalName + '" := ' + decoder +')' };
  }

  function leafTypeToDecoder(type: GraphQLType): string {
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
      t = type;
    }
    type = t;

    // leaf types only
    if (type instanceof GraphQLScalarType) {
      switch (type.name) {
        case 'Int': return prefix + 'int';
        case 'Float': return prefix + 'float';
        case 'Boolean': return prefix + 'bool';
        case 'ID':
        case 'String': return prefix + 'string';
      }
    } else if (type instanceof GraphQLEnumType) {
      return prefix + type.name.toLowerCase() + 'Decoder';
    } else {
      throw new Error('not a leaf type: ' + (<any>type).name);
    }
  }

  return walkDefinition(def, info);
}
