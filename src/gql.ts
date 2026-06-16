// All GraphQL operation documents for the Vibo consumer API, in one place so
// the wire surface is reviewable independently of the tool wiring. Field
// selections were built from live schema introspection of api.vibodj.com — see
// docs/VIBO-API.md. Tool modules import these and call client.gql(DOC, vars).

const SONG_LINKS = `links { spotify appleMusic youtube tidal soundcloud deezer }`;
const THUMBS = `thumbnails { s180x180 original }`;
const LOCATION = `location { name lat lng }`;

// ---- Profile ----------------------------------------------------------------

export const GET_ME = `
  query getMe {
    me {
      _id firstName lastName email phoneCode phoneNumber country lang
      imageUrl role loginType spotifyConnected appleMusicConnected
      ${LOCATION}
    }
  }
`;

// ---- Events -----------------------------------------------------------------

const EVENT_LIST_ITEM = `
  _id title status type date timezone role isPast isLocked playlistSize
  usersCount hostsCount guestsCount sectionsWithSongs sectionsWithSongsTotal
  sectionsWithSongsProgress questionsCount answeredQuestionsCount isPro
  ${LOCATION}
`;

export const LIST_UPCOMING_EVENTS = `
  query getUpcomingEvents($filter: EventsFilterInput, $pagination: PaginationInput, $sort: SortInput) {
    upcomingEvents(filter: $filter, pagination: $pagination, sort: $sort) {
      events { ${EVENT_LIST_ITEM} }
      next { skip limit }
      totalCount
    }
  }
`;

export const LIST_HISTORY_EVENTS = `
  query getHistoryEvents($filter: EventsFilterInput, $pagination: PaginationInput, $sort: SortInput) {
    historyEvents(filter: $filter, pagination: $pagination, sort: $sort) {
      events { ${EVENT_LIST_ITEM} }
      next { skip limit }
      totalCount
    }
  }
`;

export const GET_EVENT = `
  query getEvent($eventId: ID!) {
    event(eventId: $eventId) {
      _id title status type date timezone arrivalTime startTime endTime
      role isPast isLocked lockDate note hostsCount guestsCount usersCount
      playlistSize sectionsCount sectionsWithSongs sectionsWithSongsTotal
      sectionsWithSongsProgress questionsCount answeredQuestionsCount
      dontPlayVisibility hostDeepLink guestDeepLink isPro firstSectionId
      ${LOCATION}
    }
  }
`;

export const JOIN_EVENT_BY_DEEP_LINK = `
  mutation joinEventViaDeepLink($deepLink: String!) {
    joinEventViaDeepLink(deepLink: $deepLink) { _id }
  }
`;

export const JOIN_EVENT_BY_HASH = `
  mutation joinEventByHash($hash: String!) {
    joinEventByHash(hash: $hash) { _id }
  }
`;

export const LEAVE_EVENT = `
  mutation leaveEvent($eventId: ID!) {
    leaveEvent(eventId: $eventId)
  }
`;

export const CREATE_EVENT_CONTACT = `
  mutation createEventContact($eventId: ID!, $payload: CreateContactInput!) {
    createEventContact(eventId: $eventId, payload: $payload) {
      _id role email firstName lastName phoneCode phoneNumber
    }
  }
`;

// ---- Sections (timeline) ----------------------------------------------------

export const LIST_SECTIONS = `
  query sections($eventId: ID!, $filter: SectionsFilterInput) {
    sections(eventId: $eventId, filter: $filter) {
      _id name time note description type
      hasNote hasComments hasSongs hasQuestions
      songsCount songsInfo questionsCount answeredCount songIdeasCount
      visibility progress totalProgress
      coverSong { artist title }
    }
  }
`;

// ---- Songs ------------------------------------------------------------------

export const GET_SECTION_SONGS = `
  query getSectionSongs($eventId: ID!, $sectionId: ID!, $filter: SectionSongsFilter, $pagination: PaginationInput, $sort: SongsSortInput) {
    getSectionSongs(eventId: $eventId, sectionId: $sectionId, filter: $filter, pagination: $pagination, sort: $sort) {
      songs {
        _id viboSongId artist title isMustPlay isFlagged comment
        likedByMe likesCount commentsCount isAddedByMe canRemove createdAt
        creator { _id firstName lastName }
        ${THUMBS}
        ${SONG_LINKS}
      }
      next { skip limit }
      totalCount
    }
  }
`;

export const SEARCH_SONGS = `
  query getSongs($eventId: ID!, $sectionId: ID!, $filter: SongsFilter!, $limit: Int!) {
    getSongs(eventId: $eventId, sectionId: $sectionId, filter: $filter, limit: $limit) {
      sectionSongId viboSongId songUrl title artist isInSection isDontPlay
      ${THUMBS}
      ${SONG_LINKS}
    }
  }
`;

export const ADD_SONG_TO_SECTION = `
  mutation addSongToSection($eventId: ID!, $sectionId: ID!, $payload: AddSongToSectionInput!) {
    addSongToSection(eventId: $eventId, sectionId: $sectionId, payload: $payload) {
      added songId totalCount sectionsWithSongs sectionsWithSongsTotal
      sectionsWithSongsProgress totalProgress songsInfo
    }
  }
`;

export const TOGGLE_LIKE = `
  mutation toggleLike($eventId: ID!, $sectionId: ID!, $songId: ID!, $liked: Boolean!) {
    toggleLike(eventId: $eventId, sectionId: $sectionId, songId: $songId, liked: $liked) { liked }
  }
`;

// ---- Playlists (connected Spotify / Apple Music) ----------------------------

export const GET_PLAYLISTS = `
  query getPlaylists($source: MusicImportSource!, $pagination: PaginationInput, $filter: PlaylistsFilter) {
    getPlaylists(source: $source, pagination: $pagination, filter: $filter) {
      playlists { id name total images { url width height } }
      total
      next { skip limit }
    }
  }
`;

export const GET_PLAYLIST_SONGS = `
  query getPlaylistSongs($playlistId: ID!, $source: MusicImportSource!, $pagination: PaginationInput) {
    getPlaylistSongs(playlistId: $playlistId, source: $source, pagination: $pagination) {
      tracks { id title artist songUrl images { url width height } }
      total
      next { skip limit }
    }
  }
`;

export const EXPORT_EVENT_TO_SPOTIFY = `
  mutation exportEventToSpotify($eventId: ID!, $sectionIds: [ID!]!, $sort: SongsSortInput, $filter: ExportEventFilter, $title: String) {
    exportEventToSpotify(eventId: $eventId, sectionIds: $sectionIds, sort: $sort, filter: $filter, title: $title) {
      playlistUrl exportedCount title
      failedToExport { text viboSongId sectionId }
    }
  }
`;

export const EXPORT_EVENT_TO_APPLE_MUSIC = `
  mutation exportEventToAppleMusic($eventId: ID!, $sectionIds: [ID!]!, $sort: SongsSortInput, $filter: ExportEventFilter, $title: String) {
    exportEventToAppleMusic(eventId: $eventId, sectionIds: $sectionIds, sort: $sort, filter: $filter, title: $title) {
      playlistUrl exportedCount title
      failedToExport { text viboSongId sectionId }
    }
  }
`;

// ---- Notifications ----------------------------------------------------------

export const GET_NOTIFICATIONS = `
  query getNotifications($pagination: PaginationInput) {
    getNotifications(pagination: $pagination) {
      notifications {
        _id imageUrl header body isRead notificationType createdAt
        metadata { eventId sectionId questionId }
      }
      next { skip limit }
      totalCount
    }
  }
`;

export const GET_NOTIFICATIONS_COUNT = `
  query getNotificationsCount {
    getNotificationsCount { total }
  }
`;

export const MARK_AS_READ = `
  mutation markAsRead($notificationIds: [ID!], $readAll: Boolean) {
    markAsRead(notificationIds: $notificationIds, readAll: $readAll)
  }
`;
