/// <reference path="./graphql-types.d.ts" />
/// <reference path="./graphql-language.d.ts" />

/**
 * GraphQL utilities.
 */
declare module "graphql/utilities" {
  import { GraphQLOutputType, GraphQLSchema, GraphQLType, GraphQLInputType } from 'graphql/type';
  import { Type, Node } from 'graphql/language';

  export class TypeInfo {
    constructor(schema: GraphQLSchema);
    getType(): GraphQLOutputType;
    getInputType(): GraphQLInputType;

    enter(node: Node): void;
    leave(node: Node): void;
  }

  export const introspectionQuery: string;

  export function buildClientSchema(
    introspection: string
  ): GraphQLSchema;

  export function typeFromAST(
    schema: GraphQLSchema,
    inputTypeAST: Type
  ): GraphQLType;
}
