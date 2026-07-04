export const ipcChannels = {
  profilesList: 'profiles:list',
  profilesSave: 'profiles:save',
  profilesRemove: 'profiles:remove',
  templatesList: 'templates:list',
  templatesSave: 'templates:save',
  templatesRemove: 'templates:remove',
  brokerListConnections: 'broker:list-connections',
  brokerConnect: 'broker:connect',
  brokerDisconnect: 'broker:disconnect',
  brokerSubscribe: 'broker:subscribe',
  brokerUnsubscribe: 'broker:unsubscribe',
  brokerPublish: 'broker:publish',
  brokerSetCapturePaused: 'broker:set-capture-paused',
  brokerGetHistory: 'broker:get-history',
  brokerEvents: 'broker:events'
} as const;
