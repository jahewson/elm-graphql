/// <reference path="./graphql-types.d.ts" />
/// <reference path="./graphql-language.d.ts" />

/**
 * GraphQL utilities.
 */
declare module "graphql/utilities" {
  import { GraphQLOutputType, GraphQLSchema, GraphQLType } from 'graphql/type';
  import { Type, Node } from 'graphql/language';

  export class TypeInfo {
    constructor(schema: GraphQLSchema);
    getType(): GraphQLOutputType;
    enter(node: Node);
    leave(node): Node;
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
