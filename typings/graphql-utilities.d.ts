/// <reference path="./graphql-types.d.ts" />

import { GraphQLOutputType } from 'graphql/type';

/**
 * GraphQL utilities.
 */
declare module "graphql/utilities" {
  export class TypeInfo {
    getType(): GraphQLOutputType;
  }

  export const introspectionQuery: string;

  export function buildClientSchema(
    introspection: IntrospectionQuery
  ): GraphQLSchema {

  export function typeFromAST(
    schema: GraphQLSchema,
    inputTypeAST: Type
  ): GraphQLType;
}
