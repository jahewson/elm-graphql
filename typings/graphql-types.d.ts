/**
 * GraphQL types. See: http://graphql.org/docs/api-reference-type-system
 */
declare module "graphql/type" {
  // Types
  export type GraphQLType =
    GraphQLScalarType |
    GraphQLObjectType |
    GraphQLInterfaceType |
    GraphQLUnionType |
    GraphQLEnumType |
    GraphQLInputObjectType |
    GraphQLList |
    GraphQLNonNull;

  export type GraphQLOutputType =
    GraphQLScalarType |
      GraphQLObjectType |
      GraphQLInterfaceType |
      GraphQLUnionType |
      GraphQLEnumType |
      GraphQLList<GraphQLOutputType> |
      GraphQLNonNull<
        GraphQLScalarType |
          GraphQLObjectType |
          GraphQLInterfaceType |
          GraphQLUnionType |
          GraphQLEnumType |
          GraphQLList<GraphQLOutputType>
        >;

  type TypeMap = { [typeName: string]: GraphQLType }

  export class GraphQLDirective {
    name: string;
    description: string;
    args: Array<GraphQLArgument>;
    onOperation: boolean;
    onFragment: boolean;
    onField: boolean;
  }

  export interface GraphQLArgument {
    name: string;
    type: GraphQLInputType;
    defaultValue?: any;
    description?: string;
  }

  export type GraphQLInputType =
    GraphQLScalarType |
      GraphQLEnumType |
      GraphQLInputObjectType |
      GraphQLList<GraphQLInputType> |
      GraphQLNonNull<
        GraphQLScalarType |
          GraphQLEnumType |
          GraphQLInputObjectType |
          GraphQLList<GraphQLInputType>
        >;

  // Schema
  export class GraphQLSchema {
    constructor(config: any)

    getQueryType(): GraphQLObjectType;
    getMutationType(): GraphQLObjectType;
    getSubscriptionType(): GraphQLObjectType;
    getTypeMap(): TypeMap;
    getType(name: string): GraphQLType;
    getDirectives(): Array<GraphQLDirective>;
    getDirective(name: string): GraphQLDirective;
  }

  // Definitions
  export class GraphQLScalarType { constructor(config: any) }

  export class GraphQLObjectType {
    constructor(config: any);

    getFields(): GraphQLFieldDefinitionMap;
    getInterfaces(): Array<GraphQLInterfaceType>;
  }

  export type GraphQLFieldDefinitionMap = {
    [fieldName: string]: GraphQLFieldDefinition;
  };

  export type GraphQLFieldDefinition = {
    name: string;
    description: string;
    type: GraphQLOutputType;
    args: Array<GraphQLArgument>;
    //resolve?: GraphQLFieldResolveFn;
    deprecationReason?: string;
  }

  export class GraphQLInterfaceType { constructor(config: any) }
  export class GraphQLUnionType { constructor(config: any) }

  export class GraphQLEnumType {
    name: string;
    description: string;

    constructor(config: any);
    getValues(): Array<GraphQLEnumValueDefinition/* <T> */>;
  }

  export type GraphQLEnumValueDefinition/* <T> */ = {
    name: string;
    description: string;
    deprecationReason: string;
    value: any/* T */;
  }

  export class GraphQLInputObjectType { constructor(config: any) }
  export class GraphQLList<T> { constructor(config: any) }
  export class GraphQLNonNull<T> { constructor(config: any) }
  
  // Scalars
  export class GraphQLInt extends GraphQLScalarType { constructor(config: any) }
  export class GraphQLFloat extends GraphQLScalarType { constructor(config: any) }
  export class GraphQLString extends GraphQLScalarType { constructor(config: any) }
  export class GraphQLBoolean extends GraphQLScalarType { constructor(config: any) }
  export class GraphQLID extends GraphQLScalarType { constructor(config: any) }
}

// /**
//  * GraphQL parser.
//  */
// declare module "graphql/language"{
//   export class Document {
//     // ...
//   }
//
//   export function parse(source: string, options?): Document;
// }
