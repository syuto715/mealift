import { progressPhotoSync } from '../progressPhotoSync';
import { runStandardSyncTests } from './standardSyncTests';

runStandardSyncTests({
  module: progressPhotoSync,
  validLocalPayload: {
    id: 'pp-1',
    date: '2026-05-06',
    photo_uri: 'file:///tmp/photo.jpg',
    pose_type: 'front',
    note: null,
  },
  validServerRow: {
    id: 'pp-1',
    user_id: 'u-1',
    date: '2026-05-06',
    photo_uri: 'file:///tmp/photo.jpg',
    pose_type: 'front',
    note: null,
    updated_at: '2026-05-06T10:00:00Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_progress_photos',
  expectedLocalTable: 'progress_photos',
});
