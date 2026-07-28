// Side-effect type import: pulls in the ambient global `UmbExtensionManifest` type
// declared by the backoffice package (declare global in extension-registry/models/types.ts).
import type {} from '@umbraco-cms/backoffice/extension-registry';
import { manifests as boardManifests } from './property-editors/board/manifests.js';
import { manifests as calendarManifests } from './property-editors/calendar/manifests.js';

export const manifests: Array<UmbExtensionManifest> = [...boardManifests, ...calendarManifests];
