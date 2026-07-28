// Side-effect type import: pulls in the ambient global `UmbExtensionManifest` type
// declared by the backoffice package (declare global in extension-registry/models/types.ts).
import type {} from '@umbraco-cms/backoffice/extension-registry';

export const manifests: Array<UmbExtensionManifest> = [];
