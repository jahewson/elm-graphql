/**
 * Copyright (c) 2016, John Hewson
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     1. Redistributions of source code must retain the above copyright
 *        notice, this list of conditions and the following disclaimer.
 *     2. Redistributions in binary form must reproduce the above copyright
 *        notice, this list of conditions and the following disclaimer in the
 *        documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

export type ElmDecl = ElmType | ElmTypeAlias | ElmFunction;

export interface ElmType {
  name: string;
  constructors: Array<string>;
}

export interface ElmTypeAlias {
  name: string;
  fields: Array<ElmField>;
}

export type ElmField = ElmRecordField | ElmLeafField;

export interface ElmRecordField {
  name: string;
  fields: Array<ElmField>;
}

export interface ElmLeafField {
  name: string;
  type: string;
}

export interface ElmFunction {
  name: string;
  parameters: Array<ElmParameter>;
  returnType: string;
  body: string; // todo
}

export interface ElmParameter {
  name: string;
  type: string;
}

export function moduleToElm(name: string, imports: Array<string>, decls: Array<ElmDecl>) {
  return 'module ' + name + ' (..) where\n' +
    imports.map(str => '\nimport ' + str) + '\n\n' +
    decls.map(declToElm).join('\n\n');
}

export function declToElm(decl: ElmDecl): string {
  if ((<ElmType>decl).constructors) {
    return typeToElm(<ElmType>decl);
  } else if ((<ElmFunction>decl).returnType) {
    return functionToElm(<ElmFunction>decl);
  } else {
    return aliasToElm(<ElmTypeAlias>decl);
  }
}

export function typeToElm(type: ElmType): string {
  return 'type ' + type.name + '\n' +
    '    = ' + type.constructors.join('\n    | ') + '\n';
}

export function aliasToElm(type: ElmTypeAlias): string {
  return 'type alias ' + type.name + ' =\n' +
    '    { ' + type.fields.map(f => fieldToElm(f, 1)).join('\n    , ') + '    }\n';
}

export function functionToElm(func: ElmFunction): string {
  let paramTypes = func.parameters.map(p => p.type).join(' -> ');
  let paramNames = func.parameters.map(p => p.name).join(' ');
  let arrow = paramTypes.length > 0 ? ' -> ' : '';
  let space = paramTypes.length > 0 ? ' ' : '';
  return func.name + ' : ' + paramTypes + arrow + func.returnType + '\n' +
         func.name + space + paramNames + ' =\n    ' + func.body + '\n';
}

function fieldToElm(field: ElmField, level: number): string {
  if ((<ElmLeafField>field).type) {
    return leafToElm(<ElmLeafField>field);
  } else {
    return recordToElm(<ElmRecordField>field, level + 1);
  }
}

function recordToElm(record: ElmRecordField, level: number): string {
  let indent = makeIndent(level);
  let type = `${indent}{ ` +
              record.fields.map(f => fieldToElm(f, level)).join(`${indent}, `) +
              `${indent}}`;
  return record.name + ' :\n' + type + '\n';
}

function leafToElm(field: ElmLeafField): string {
  return field.name + ' : ' + field.type + '\n';
}

function makeIndent(level: number) {
  let str = '';
  for (let i = 0; i < level; i++) {
    str += '    ';
  }
  return str;
}
