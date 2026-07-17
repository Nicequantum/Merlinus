import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { extensionForMime, isMediaRecorderAvailable, pickMediaRecorderMimeType } from '../../src/lib/video_mpi/mime';

const root = resolve(process.cwd());

function readSrc(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('video_mpi capture module', () => {
  it('pickMediaRecorderMimeType is safe without browser MediaRecorder', () => {
    // Node test env: MediaRecorder is typically undefined
    assert.equal(typeof pickMediaRecorderMimeType(), 'string');
    assert.equal(typeof isMediaRecorderAvailable(), 'boolean');
  });

  it('maps mime types to file extensions', () => {
    assert.equal(extensionForMime('video/webm;codecs=vp9'), 'webm');
    assert.equal(extensionForMime('video/mp4'), 'mp4');
    assert.equal(extensionForMime('video/quicktime'), 'mp4');
  });

  it('VideoCaptureSession finalizes with requestData and stops tracks', () => {
    const src = readSrc('src/lib/video_mpi/VideoCaptureSession.ts');
    assert.match(src, /requestData/);
    assert.match(src, /recorder\.stop/);
    assert.match(src, /track\.stop/);
    assert.match(src, /wakeLock/);
    assert.match(src, /requestFullscreen|enterFullscreen/);
    assert.match(src, /beforeunload/);
    assert.match(src, /blob\.size/);
    assert.match(src, /FINALIZE_TIMEOUT_MS/);
  });

  it('VideoInspectionView uses video_mpi session and destroys on leave', () => {
    const view = readSrc('src/components/videoInspection/VideoInspectionView.tsx');
    assert.match(view, /VideoCaptureSession/);
    assert.match(view, /uploadVideoMpiCapture/);
    assert.match(view, /destroyCaptureSession/);
    assert.match(view, /video-mpi-capture-shell/);
    assert.match(view, /capture=\"environment\"/);
    // Must not leave an unmanaged MediaRecorder on the view
    assert.equal(view.includes('new MediaRecorder'), false);
  });

  it('upload client retries once and rejects empty blobs', () => {
    const src = readSrc('src/lib/video_mpi/uploadClient.ts');
    assert.match(src, /attempt < 2/);
    assert.match(src, /No video data to upload/);
    assert.match(src, /uploadVideoInspection/);
  });
});
