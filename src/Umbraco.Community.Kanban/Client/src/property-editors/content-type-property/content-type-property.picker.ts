import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { umbOpenModal, UMB_ITEM_PICKER_MODAL } from '@umbraco-cms/backoffice/modal';
import {
  UMB_DOCUMENT_TYPE_PICKER_MODAL,
  UmbDocumentTypeDetailRepository,
  type UmbDocumentTypeDetailModel,
} from '@umbraco-cms/backoffice/document-type';
import {
  isSystemProperty,
  toPropertyPickerItems,
  toSystemPropertyPickerItems,
  type KanbanPickedProperty,
  type KanbanPropertyPickerItem,
} from './content-type-property.model.js';

/**
 * Browses to a content type property: choose a document type, then choose one of its properties.
 * The same sequence Umbraco itself uses to add a column to a Collection, so an alias that resolves
 * to nothing cannot be typed.
 *
 * Shared by every Kanban setting that names a property, so they all behave identically. Resolves to
 * `undefined` whenever the editor backs out of either step.
 *
 * `includeSystemProperties` offers the document's own fields — created date, last edited and friends —
 * alongside the content type's properties. Card properties want them; a lane property cannot use them,
 * because lanes are resolved through the data type behind a property and a system field has none.
 */
export async function pickContentTypeProperty(
  host: UmbControllerHost,
  options?: { includeSystemProperties?: boolean },
): Promise<KanbanPickedProperty | undefined> {
  const contentType = await pickContentType(host);
  if (!contentType) return undefined;

  const contentTypeItems = toPropertyPickerItems(contentType.properties);
  const items: KanbanPropertyPickerItem[] = options?.includeSystemProperties
    ? [...toSystemPropertyPickerItems(), ...contentTypeItems]
    : contentTypeItems;

  const picked = await umbOpenModal(host, UMB_ITEM_PICKER_MODAL, {
    data: {
      headline: `Select a property from ${contentType.name}`,
      items,
    },
  }).catch(() => undefined);

  if (!picked?.value) return undefined;

  return {
    alias: picked.value,
    contentTypeUnique: contentType.unique,
    contentTypeName: contentType.name,
    label: items.find((item) => item.value === picked.value)?.label ?? picked.value,
    // Only claimed when system properties were actually on offer, so a content type property that
    // happens to be aliased "published" is never mistaken for the document flag.
    isSystem: options?.includeSystemProperties === true && isSystemProperty(picked.value),
  };
}

/**
 * Opens the document type tree, then reads the picked type in full — the tree hands back a unique,
 * and the property list only exists on the detail model.
 *
 * Document types only: a board reads a document's children, so media and member types are never
 * candidates. Umbraco's own picker offers the other kinds and asks which first; with one kind there
 * is nothing to ask, and core skips that modal for the same reason.
 */
async function pickContentType(host: UmbControllerHost): Promise<UmbDocumentTypeDetailModel | undefined> {
  const picked = await umbOpenModal(host, UMB_DOCUMENT_TYPE_PICKER_MODAL, {
    data: {
      hideTreeRoot: true,
      multiple: false,
      // An element type is never a document in its own right, so it can never be the content type a
      // board reads children of. Umbraco's own column picker filters it out identically.
      pickableFilter: (item) => (item as { isElement?: boolean }).isElement !== true,
    },
  }).catch(() => undefined);

  const unique = picked?.selection?.[0];
  if (!unique) return undefined;

  const { data } = await new UmbDocumentTypeDetailRepository(host).requestByUnique(unique);

  return data ?? undefined;
}
