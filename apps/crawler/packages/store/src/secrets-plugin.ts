import {
  OperationNodeTransformer,
  type KyselyPlugin,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type PrimitiveValueListNode,
  type QueryResult,
  type RootOperationNode,
  type UnknownRow,
  type ValueNode,
} from 'kysely';
import { SECRETS, type Redactor } from '@mudpuppy/core';

class RedactValues extends OperationNodeTransformer {
  constructor(private readonly r: Redactor) {
    super();
  }

  protected override transformValue(node: ValueNode): ValueNode {
    const v = super.transformValue(node);
    return typeof v.value === 'string' ? { ...v, value: this.r.redact(v.value) } : v;
  }

  protected override transformPrimitiveValueList(
    node: PrimitiveValueListNode,
  ): PrimitiveValueListNode {
    const v = super.transformPrimitiveValueList(node);
    return {
      ...v,
      values: v.values.map((x) => (typeof x === 'string' ? this.r.redact(x) : x)),
    };
  }
}

/**
 * Redacts registered secrets from every value an INSERT or UPDATE writes (FR-019). Reads are
 * untouched (a WHERE on a value must still match), and so are binary values: the vault's
 * ciphertexts are Buffers.
 */
export function secretsPlugin(redactor: Redactor = SECRETS): KyselyPlugin {
  const t = new RedactValues(redactor);
  return {
    transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
      if (redactor.size === 0) return args.node;
      const k = args.node.kind;
      return k === 'InsertQueryNode' || k === 'UpdateQueryNode'
        ? t.transformNode(args.node)
        : args.node;
    },
    async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
      return args.result;
    },
  };
}
