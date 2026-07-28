import { manifests as boardManifests } from './property-editors/board/manifests.js';
import { manifests as calendarManifests } from './property-editors/calendar/manifests.js';
import { manifests as laneOverrideManifests } from './property-editors/lane-overrides/manifests.js';
import { manifests as manualLaneManifests } from './property-editors/manual-lanes/manifests.js';
import { manifests as collectionViewManifests } from './hosts/manifests.js';
import { manifests as dataTypeWorkspaceViewManifests } from './workspace-views/manifests.js';

export const manifests: Array<UmbExtensionManifest> = [
  ...boardManifests,
  ...calendarManifests,
  ...laneOverrideManifests,
  ...manualLaneManifests,
  ...collectionViewManifests,
  ...dataTypeWorkspaceViewManifests,
];
