import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import { UMB_DATA_TYPE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/data-type';
import type { UmbConditionConfigBase, UmbConditionControllerArguments, UmbExtensionCondition } from '@umbraco-cms/backoffice/extension-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import {
  KANBAN_COLLECTION_PROPERTY_EDITOR_UI_ALIAS,
  KANBAN_DATA_TYPE_IS_COLLECTION_CONDITION_ALIAS,
} from '@/constants.js';

export type KanbanDataTypeIsCollectionConditionConfig = UmbConditionConfigBase<
  typeof KANBAN_DATA_TYPE_IS_COLLECTION_CONDITION_ALIAS
>;

const ObserveSymbol = Symbol();

/**
 * Permits an extension only while the open Data Type workspace edits a Collection data type.
 * Umbraco has no built-in condition for "this data type's property editor UI alias is X", so
 * this follows the same shape as Umbraco's own `UmbWorkspaceHasContentCollectionCondition`:
 * consume the workspace context and observe the value the decision depends on.
 */
export class KanbanDataTypeIsCollectionCondition
  extends UmbConditionBase<KanbanDataTypeIsCollectionConditionConfig>
  implements UmbExtensionCondition
{
  constructor(
    host: UmbControllerHost,
    args: UmbConditionControllerArguments<KanbanDataTypeIsCollectionConditionConfig>,
  ) {
    super(host, args);

    this.consumeContext(UMB_DATA_TYPE_WORKSPACE_CONTEXT, (context) => {
      this.observe(
        context?.propertyEditorUiAlias,
        (alias) => {
          this.permitted = alias === KANBAN_COLLECTION_PROPERTY_EDITOR_UI_ALIAS;
        },
        ObserveSymbol,
      );
    });
  }
}

export { KanbanDataTypeIsCollectionCondition as api };

declare global {
  interface UmbExtensionConditionConfigMap {
    kanbanDataTypeIsCollection: KanbanDataTypeIsCollectionConditionConfig;
  }
}
