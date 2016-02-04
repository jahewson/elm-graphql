/**
 * GraphQL types. See: http://graphql.org/docs/api-reference-type-system
 */
declare module "graphql/type" {
  // Schema
  export class GraphQLSchema { constructor(config: any) }

  // Definitions
  export class GraphQLScalarType { constructor(config: any) }
  export class GraphQLObjectType { constructor(config: any) }
  export class GraphQLInterfaceType { constructor(config: any) }
  export class GraphQLUnionType { constructor(config: any) }
  export class GraphQLEnumType { constructor(config: any) }
  export class GraphQLInputObjectType { constructor(config: any) }
  export class GraphQLList { constructor(config: any) }
  export class GraphQLNonNull { constructor(config: any) }
  
  // Scalars
  export class GraphQLInt extends GraphQLScalarType { constructor(config: any) }
  export class GraphQLFloat extends GraphQLScalarType { constructor(config: any) }
  export class GraphQLString extends GraphQLScalarType { constructor(config: any) }
  export class GraphQLBoolean extends GraphQLScalarType { constructor(config: any) }
  export class GraphQLID extends GraphQLScalarType { constructor(config: any) }
}

/**
 * GraphQL parser.
 */
declare module "graphql/language"{
  export class Document {
    // ...
  }

  export function parse(source: string, options?): Document;
}
