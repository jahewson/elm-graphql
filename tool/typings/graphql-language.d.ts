/**
 *  Copyright (c) 2015, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

/**
 * GraphQL parser.
 */
declare module "graphql/language" {
  export function parse(source:string, options?): Document;

  /**
   * Converts an AST into a string, using one set of reasonable
   * formatting rules.
   */
  export function print(ast: Node): string;

  //import type { Source } from './source';

  export class Source {
    body:string;
    name:string;

    constructor(body:string, name?:string);
  }

  /**
   * Contains a range of UTF-8 character offsets that identify
   * the region of the source from which the AST derived.
   */
  export type Location = {
    start: number;
    end: number;
    source?: Source
  }

  /**
   * The list of all possible AST node types.
   */
  export type Node = Name
    | Document
    | OperationDefinition
    | VariableDefinition
    | Variable
    | SelectionSet
    | Field
    | Argument
    | FragmentSpread
    | InlineFragment
    | FragmentDefinition
    | IntValue
    | FloatValue
    | StringValue
    | BooleanValue
    | EnumValue
    | ListValue
    | ObjectValue
    | ObjectField
    | Directive
    | NamedType
    | ListType
    | NonNullType
    | ObjectTypeDefinition
    | FieldDefinition
    | InputValueDefinition
    | InterfaceTypeDefinition
    | UnionTypeDefinition
    | ScalarTypeDefinition
    | EnumTypeDefinition
    | EnumValueDefinition
    | InputObjectTypeDefinition
    | TypeExtensionDefinition

  // Name

  export type Name = {
    kind: string;
    loc?: Location;
    value: string;
  }

  // Document

  export type Document = {
    kind: string;
    loc?: Location;
    definitions: Array<Definition>;
  }

  export type Definition = OperationDefinition
    | FragmentDefinition
    | TypeDefinition
    | TypeExtensionDefinition

  export type OperationDefinition = {
    kind: string;
    loc?: Location;
    // Note: subscription is an experimental non-spec addition.
    operation: string; // 'queryDocument' | 'mutation' | 'subscription';
    name?: Name;
    variableDefinitions?: Array<VariableDefinition>;
    directives?: Array<Directive>;
    selectionSet: SelectionSet;
  }

  export type VariableDefinition = {
    kind: string;
    loc?: Location;
    variable: Variable;
    type: Type;
    defaultValue?: Value;
  }

  export type Variable = {
    kind: string;
    loc?: Location;
    name: Name;
  }

  export type SelectionSet = {
    kind: string;
    loc?: Location;
    selections: Array<Selection>;
  }

  export type Selection = Field
    | FragmentSpread
    | InlineFragment

  export type Field = {
    kind: string;
    loc?: Location;
    alias?: Name;
    name: Name;
    arguments?: Array<Argument>;
    directives?: Array<Directive>;
    selectionSet?: SelectionSet;
  }

  export type Argument = {
    kind: string;
    loc?: Location;
    name: Name;
    value: Value;
  }


  // Fragments

  export type FragmentSpread = {
    kind: string;
    loc?: Location;
    name: Name;
    directives?: Array<Directive>;
  }

  export type InlineFragment = {
    kind: string;
    loc?: Location;
    typeCondition?: NamedType;
    directives?: Array<Directive>;
    selectionSet: SelectionSet;
  }

  export type FragmentDefinition = {
    kind: string;
    loc?: Location;
    name: Name;
    typeCondition: NamedType;
    directives?: Array<Directive>;
    selectionSet: SelectionSet;
  }


  // Values

  export type Value = Variable
    | IntValue
    | FloatValue
    | StringValue
    | BooleanValue
    | EnumValue
    | ListValue
    | ObjectValue

  export type IntValue = {
    kind: string;
    loc?: Location;
    value: string;
  }

  export type FloatValue = {
    kind: string;
    loc?: Location;
    value: string;
  }

  export type StringValue = {
    kind: string;
    loc?: Location;
    value: string;
  }

  export type BooleanValue = {
    kind: string;
    loc?: Location;
    value: boolean;
  }

  export type EnumValue = {
    kind: string;
    loc?: Location;
    value: string;
  }

  export type ListValue = {
    kind: string;
    loc?: Location;
    values: Array<Value>;
  }

  export type ObjectValue = {
    kind: string;
    loc?: Location;
    fields: Array<ObjectField>;
  }

  export type ObjectField = {
    kind: string;
    loc?: Location;
    name: Name;
    value: Value;
  }


  // Directives

  export type Directive = {
    kind: string;
    loc?: Location;
    name: Name;
    arguments?: Array<Argument>;
  }


  // Type Reference

  export type Type = NamedType
    | ListType
    | NonNullType

  export type NamedType = {
    kind: string;
    loc?: Location;
    name: Name;
  };

  export type ListType = {
    kind: string;
    loc?: Location;
    type: Type;
  }

  export type NonNullType = {
    kind: string;
    loc?: Location;
    type: NamedType | ListType;
  }

  // Type Definition

  export type TypeDefinition = ObjectTypeDefinition
    | InterfaceTypeDefinition
    | UnionTypeDefinition
    | ScalarTypeDefinition
    | EnumTypeDefinition
    | InputObjectTypeDefinition

  export type ObjectTypeDefinition = {
    kind: string;
    loc?: Location;
    name: Name;
    interfaces?: Array<NamedType>;
    fields: Array<FieldDefinition>;
  }

  export type FieldDefinition = {
    kind: string;
    loc?: Location;
    name: Name;
    arguments: Array<InputValueDefinition>;
    type: Type;
  }

  export type InputValueDefinition = {
    kind: string;
    loc?: Location;
    name: Name;
    type: Type;
    defaultValue?: Value;
  }

  export type InterfaceTypeDefinition = {
    kind: string;
    loc?: Location;
    name: Name;
    fields: Array<FieldDefinition>;
  }

  export type UnionTypeDefinition = {
    kind: string;
    loc?: Location;
    name: Name;
    types: Array<NamedType>;
  }

  export type ScalarTypeDefinition = {
    kind: string;
    loc?: Location;
    name: Name;
  }

  export type EnumTypeDefinition = {
    kind: string;
    loc?: Location;
    name: Name;
    values: Array<EnumValueDefinition>;
  }

  export type EnumValueDefinition = {
    kind: string;
    loc?: Location;
    name: Name;
  }

  export type InputObjectTypeDefinition = {
    kind: string;
    loc?: Location;
    name: Name;
    fields: Array<InputValueDefinition>;
  }

  export type TypeExtensionDefinition = {
    kind: string;
    loc?: Location;
    definition: ObjectTypeDefinition;
  }
}
