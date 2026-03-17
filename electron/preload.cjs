const { contextBridge, ipcRenderer } = require('electron')

const runtime = process.env.SHICI_DESKTOP_RUNTIME || 'unknown'

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload)
}

contextBridge.exposeInMainWorld('desktopMeta', {
  platform: process.platform,
  runtime,
})

contextBridge.exposeInMainWorld('desktopPoems', {
  queryPoems: query => invoke('poems:query', query),
  searchPoemsFullText: params => invoke('poems:fulltext', params),
  getPoemById: (id, shard) => invoke('poems:getById', { id, shard }),
  getPoemIndexById: id => invoke('poems:getIndexById', id),
  getPoemIndexByIds: ids => invoke('poems:getIndexByIds', ids),
  getRandomPoemIndex: notebook => invoke('poems:getRandom', notebook),
  getDailyPoemIndex: notebook => invoke('poems:getDaily', notebook),
  getPoemNotebooks: () => invoke('poems:getNotebooks'),
  loadManifest: () => invoke('poems:getManifest'),
})

contextBridge.exposeInMainWorld('desktopStudy', {
  bootstrap: payload => invoke('study:bootstrap', payload),
  getStudyRecords: () => invoke('study:getRecords'),
  getStudyRecord: poemId => invoke('study:getRecord', poemId),
  saveStudyRecord: record => invoke('study:saveRecord', record),
  markViewed: (poemId, shard) => invoke('study:markViewed', { poemId, shard }),
  toggleFavorite: poemId => invoke('study:toggleFavorite', poemId),
  markMemorized: (poemId, memorized) => invoke('study:markMemorized', { poemId, memorized }),
  getFavorites: () => invoke('study:getFavorites'),
  getMemorized: () => invoke('study:getMemorized'),
  getRecentlyViewed: limit => invoke('study:getRecentlyViewed', limit),
  getStats: () => invoke('study:getStats'),
  getReciteNotebook: () => invoke('study:getReciteNotebook'),
  setReciteNotebook: notebook => invoke('study:setReciteNotebook', notebook),
  getPoemGroups: () => invoke('study:getPoemGroups'),
  createPoemGroup: name => invoke('study:createPoemGroup', name),
  renamePoemGroup: (groupId, name) => invoke('study:renamePoemGroup', { groupId, name }),
  deletePoemGroup: groupId => invoke('study:deletePoemGroup', groupId),
  addPoemToGroup: (groupId, poemId) => invoke('study:addPoemToGroup', { groupId, poemId }),
  removePoemFromGroup: (groupId, poemId) => invoke('study:removePoemFromGroup', { groupId, poemId }),
  togglePoemInGroup: (groupId, poemId) => invoke('study:togglePoemInGroup', { groupId, poemId }),
  getPoemGroupById: groupId => invoke('study:getPoemGroupById', groupId),
  getGroupsForPoem: poemId => invoke('study:getGroupsForPoem', poemId),
})
