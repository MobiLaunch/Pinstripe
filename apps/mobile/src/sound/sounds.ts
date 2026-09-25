/**
 * Small sound effects: the swoosh of a sent post, the pop of a refresh,
 * the camera's shutter and its record tones. They follow the ring/silent
 * switch on iPhone (as iOS 6 apps did) and can be turned off in Settings;
 * the choice is kept on this device.
 */
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { secureStorage } from '@/auth/storage';

const FILES = {
  sent: require('../../assets/sounds/sent.wav'),
  pop: require('../../assets/sounds/pop.wav'),
  shutter: require('../../assets/sounds/shutter.wav'),
  recordStart: require('../../assets/sounds/record-start.wav'),
  recordStop: require('../../assets/sounds/record-stop.wav'),
} as const;

export type SoundName = keyof typeof FILES;

const KEY = 'pinstripe.soundEffects';
let enabled = true;
const listeners = new Set<(on: boolean) => void>();
const players = new Map<SoundName, AudioPlayer>();
let started = false;

function start() {
  if (started) return;
  started = true;
  // Mix with whatever's playing and stay quiet on silent.
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  secureStorage
    .get(KEY)
    .then((v) => {
      if (v === 'off') setEnabled(false, false);
    })
    .catch(() => {});
}
start();

export function play(name: SoundName) {
  if (!enabled || Platform.OS === 'web') return;
  try {
    let player = players.get(name);
    if (!player) {
      player = createAudioPlayer(FILES[name]);
      player.volume = 0.6;
      players.set(name, player);
    }
    player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // A missing sound never gets in the way.
  }
}

function setEnabled(on: boolean, save = true) {
  enabled = on;
  if (save) secureStorage.set(KEY, on ? 'on' : 'off').catch(() => {});
  for (const listener of listeners) listener(on);
}

/** The Settings switch. */
export function useSoundEffects(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return [on, (value) => setEnabled(value)];
}
