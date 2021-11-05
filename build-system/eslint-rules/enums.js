'use strict';

/**
 * Enforces all enum usage is staticly DCE-able.
 *
 * This is an opt-in lint, with enums enabling by using a "_Enum" suffix.
 *
 * Good
 * ```
 * /** @enum *\/
 * const Foo_Enum = {
 *   ABC: 1,
 *   DEF: 2,
 * };
 *
 * const { ABC: value } = Foo_Enum;
 * const value = Foo_Enum.ABC;
 * isEnumValue(Foo_Enum, value);
 * ```
 *
 * Bad
 * ```
 * const Bar_Enum = {
 *   0: 0,
 *   '1': 1,
 *   ['2'] : 2,
 *   [ref]: 4,
 * };
 *
 * Bar_Enum[0];
 * Bar_Enum['0'];
 * Bar_Enum['key'];
 * Bar_Enum[ref];
 * key in Bar_Enum;
 * ```
 *
 * @return {!Object}
 */
module.exports = function (context) {
  /**
   * @param {!Node} node
   * @return {boolean}
   */
  function hasEnumAnnotation(node) {
    const commentLines = context.getCommentsBefore(node);
    if (!commentLines) {
      return false;
    }

    return commentLines.some(function (comment) {
      return comment.type == 'Block' && /@enum/.test(comment.value);
    });
  }

  /**
   * @param {!Node|undefined} node
   */
  function checkEnumId(node) {
    if (/^[A-Z](?:[A-Za-z0-9]+_Enum|[A-Z0-9_]+_ENUM)$/.test(node.name)) {
      return;
    }
    context.report({
      node,
      message:
        'Enums should use PascalCase and end in "_Enum", or SCREAMING_SNAKE_CASE and end in "_ENUM"',
    });
  }

  /**
   * @param {!Node|undefined} node
   */
  function checkEnumKeys(node) {
    for (const prop of node.properties) {
      if (prop.computed || prop.key?.type !== 'Identifier') {
        context.report({
          node: prop,
          message: [
            'Enum keys must be a normal prop identifier',
            'eg, `{ KEY: value }` ',
          ].join('\n\t'),
        });
      }
    }
  }

  /**
   * @param {!Node} node
   */
  function checkStaticEnumUse(node) {
    const {parent} = node;
    // import { Enum } from '.'
    if (parent.type === 'ImportSpecifier') {
      return;
    }

    if (parent.type === 'VariableDeclarator') {
      // const Enum = {}
      if (parent.id === node) {
        // Check via the VariableDeclaration visitor.
        return;
      }

      // const { key } = Enum
      if (parent.init === node && parent.id.type === 'ObjectPattern') {
        checkEnumKeys(parent.id);
        return;
      }
    }

    if (parent.type === 'MemberExpression') {
      // Enum.key get
      if (parent.object === node && parent.computed === false) {
        return;
      }
    }

    if (parent.type === 'CallExpression') {
      const {arguments: args, callee} = parent;
      if (args[0] === node) {
        // isEnumValue(Enum, value)
        if (callee.type === 'Identifier') {
          const {name} = callee;
          if (name === 'isEnumValue') {
            return;
          }
        }
      }
    }

    context.report({
      node,
      message: [
        `Improper use of enum, you may only do:`,
        `- \`${node.name}.key\` get access.`,
        `- \`isEnumValue(${node.name}, someValue)\` value checks.`,
      ].join('\n\t'),
    });
  }

  return {
    Identifier(node) {
      if (/_E(NUM|num)$/.test(node.name)) {
        checkStaticEnumUse(node);
      }
    },

    VariableDeclaration(node) {
      const {declarations} = node;
      if (declarations.length !== 1) {
        return;
      }
      const decl = declarations[0];
      const {id, init} = decl;
      if (id.type !== 'Identifier') {
        return;
      }
      if (!/_E(NUM|num)$/.test(id.name)) {
        return;
      }

      let annotationNode = node;
      const {parent} = node;
      if (parent.type === 'ExportNamedDeclaration') {
        annotationNode = parent;
      }
      if (!hasEnumAnnotation(annotationNode)) {
        context.report({
          node: annotationNode,
          message: 'Static enums require an @enum annotation',
        });
      }

      checkEnumId(id);
      if (init?.type === 'ObjectExpression') {
        checkEnumKeys(init);
      } else {
        context.report({
          node: decl.init || decl,
          message: [
            'Static enums must be initialized with at literal object expression',
            `eg, \`${node.kind} ${id.name} = { … }\``,
          ].join('\n\t'),
        });
      }
    },
  };
};
