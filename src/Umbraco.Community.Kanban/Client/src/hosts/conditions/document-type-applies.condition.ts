import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import { UMB_DOCUMENT_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/document';
import type {
  UmbConditionConfigBase,
  UmbConditionControllerArguments,
  UmbExtensionCondition,
} from '@umbraco-cms/backoffice/extension-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS } from '@/constants.js';

export type KanbanDocumentTypeAppliesConditionConfig = UmbConditionConfigBase<
  typeof KANBAN_DOCUMENT_TYPE_APPLIES_CONDITION_ALIAS
> & {
  /** Content type KEYS (GUIDs) the extension applies to. Exact match — appliesTo names types, not families. */
  oneOf: string[];
};

const ObserveSymbol = Symbol();

/**
 * Permits an extension only while the open document workspace edits a document whose content type
 * key is in the configured list. Core's own Umb.Condition.WorkspaceContentTypeAlias matches
 * aliases; a Kanban configuration's appliesTo stores keys, so this condition exists to compare
 * like with like. Keys compare case-insensitively — GUID casing is not guaranteed to agree between
 * the server's serialisation and the client's.
 */
export class KanbanDocumentTypeAppliesCondition
  extends UmbConditionBase<KanbanDocumentTypeAppliesConditionConfig>
  implements UmbExtensionCondition
{
  constructor(
    host: UmbControllerHost,
    args: UmbConditionControllerArguments<KanbanDocumentTypeAppliesConditionConfig>,
  ) {
    super(host, args);

    const keys = (this.config.oneOf ?? []).map((key) => key.toLowerCase());

    this.consumeContext(UMB_DOCUMENT_WORKSPACE_CONTEXT, (context) => {
      this.observe(
        context?.contentTypeUnique,
        (unique) => {
          this.permitted = unique !== undefined && keys.includes(unique.toLowerCase());
        },
        ObserveSymbol,
      );
    });
  }
}

export { KanbanDocumentTypeAppliesCondition as api };

declare global {
  interface UmbExtensionConditionConfigMap {
    kanbanDocumentTypeApplies: KanbanDocumentTypeAppliesConditionConfig;
  }
}
