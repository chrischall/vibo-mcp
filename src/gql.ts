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

// ---- Section questions (the DJ's planning questions) ------------------------

export const LIST_SECTION_QUESTIONS = `
  query getEventSectionQuestionsV2($eventId: ID!, $sectionId: ID!) {
    getEventSectionQuestionsV2(eventId: $eventId, sectionId: $sectionId) {
      progress
      questions {
        _id
        isAnswered
        settings { type hasOther optionImagesEnabled notifyMe }
        question {
          title
          options { _id title isOther }
        }
        answer { text selectedOptions link }
      }
    }
  }
`;

export const ANSWER_SECTION_QUESTION = `
  mutation answerEventSectionQuestionV2($eventId: ID!, $sectionId: ID!, $questionId: ID!, $payload: AnswerQuestionV2Input!) {
    answerEventSectionQuestionV2(eventId: $eventId, sectionId: $sectionId, questionId: $questionId, payload: $payload) {
      progress
      question { _id isAnswered answer { text selectedOptions link } }
    }
  }
`;

// ============================================================================
// v2 / v3 operations (song management, comments, song ideas, playlist import,
// collaboration, section editing, uploads). Shapes pinned via authenticated
// introspection — see docs/VIBO-API.md.
// ============================================================================

// ---- Song management -------------------------------------------------------

export const REMOVE_SECTION_SONGS = `
  mutation removeSectionSongsV2($eventId: ID!, $sectionId: ID!, $songIds: [ID!]!) {
    removeSectionSongsV2(eventId: $eventId, sectionId: $sectionId, songIds: $songIds) {
      success sectionsWithSongs sectionsWithSongsTotal sectionsWithSongsProgress totalProgress songsInfo
    }
  }
`;

export const UPDATE_SECTION_SONGS = `
  mutation updateSectionSongs($eventId: ID!, $sectionId: ID!, $songIds: [ID!]!, $payload: UpdateSectionSongInput) {
    updateSectionSongs(eventId: $eventId, sectionId: $sectionId, songIds: $songIds, payload: $payload) {
      _id isMustPlay isFlagged comment
    }
  }
`;

export const MOVE_SECTION_SONGS = `
  mutation moveSectionSongsV2($eventId: ID!, $sourceSectionId: ID!, $targetSectionId: ID!, $songIds: [ID!]!) {
    moveSectionSongsV2(eventId: $eventId, sourceSectionId: $sourceSectionId, targetSectionId: $targetSectionId, songIds: $songIds) {
      success sectionsWithSongs sectionsWithSongsTotal sectionsWithSongsProgress songsInfo
    }
  }
`;

export const REORDER_SONGS = `
  mutation reorderSongsBatch($eventId: ID!, $sectionId: ID!, $sourceSongIds: [ID!]!, $targetSongId: ID) {
    reorderSongsBatch(eventId: $eventId, sectionId: $sectionId, sourceSongIds: $sourceSongIds, targetSongId: $targetSongId)
  }
`;

// ---- Comments --------------------------------------------------------------

export const CREATE_SONG_COMMENT = `
  mutation createSongComment($eventId: ID!, $sectionId: ID!, $songId: ID!, $payload: CreateCommentInput!) {
    createSongComment(eventId: $eventId, sectionId: $sectionId, songId: $songId, payload: $payload) {
      _id message date
    }
  }
`;

export const DELETE_SONG_COMMENT = `
  mutation deleteSongComment($eventId: ID!, $sectionId: ID!, $songId: ID!, $commentId: ID!) {
    deleteSongComment(eventId: $eventId, sectionId: $sectionId, songId: $songId, commentId: $commentId)
  }
`;

export const CREATE_SECTION_COMMENT = `
  mutation createSectionComment($eventId: ID!, $sectionId: ID!, $payload: CreateCommentInput!) {
    createSectionComment(eventId: $eventId, sectionId: $sectionId, payload: $payload) {
      _id message date
    }
  }
`;

export const DELETE_SECTION_COMMENT = `
  mutation deleteSectionComment($eventId: ID!, $sectionId: ID!, $commentId: ID!) {
    deleteSectionComment(eventId: $eventId, sectionId: $sectionId, commentId: $commentId)
  }
`;

// ---- Song ideas (the DJ's per-section suggestions) -------------------------

export const LIST_SECTION_SONG_IDEAS = `
  query getEventSectionSongIdeas($eventId: ID!, $sectionId: ID!, $pagination: PaginationInput) {
    getEventSectionSongIdeas(eventId: $eventId, sectionId: $sectionId, pagination: $pagination) {
      songIdeas { _id title description songsCount icon isPublic isOwner }
      totalCount
    }
  }
`;

export const LIST_SONG_IDEAS_SONGS = `
  query getEventSectionSongIdeasSongs($eventId: ID!, $sectionId: ID!, $songIdeasId: ID!, $pagination: PaginationInput) {
    getEventSectionSongIdeasSongs(eventId: $eventId, sectionId: $sectionId, songIdeasId: $songIdeasId, pagination: $pagination) {
      songs {
        viboSongId songUrl title artist isInSection isDontPlay isAddedByMe
        ${THUMBS}
        ${SONG_LINKS}
      }
      totalCount
    }
  }
`;

// ---- Playlist import -------------------------------------------------------

export const IMPORT_PLAYLIST_TO_SECTION = `
  mutation importPlaylistToSectionWeb($eventId: ID!, $sectionId: ID!, $playlistId: ID, $source: MusicImportSource!, $tracksToAdd: [ID]!, $tracksToIgnore: [ID]!) {
    importPlaylistToSectionWeb(eventId: $eventId, sectionId: $sectionId, playlistId: $playlistId, source: $source, tracksToAdd: $tracksToAdd, tracksToIgnore: $tracksToIgnore) {
      totalCount addedCount existingCount dontPlayCount ignoredCount songsInfo sectionsWithSongs sectionsWithSongsTotal
    }
  }
`;

// ---- Collaboration ---------------------------------------------------------

export const LIST_EVENT_USERS = `
  query eventUsers($eventId: ID!, $usersType: EventUserType, $pagination: PaginationInput) {
    eventUsers(eventId: $eventId, usersType: $usersType, pagination: $pagination) {
      users { _id firstName lastName email role imageUrl }
      totalCount
    }
  }
`;

export const INVITE_USERS = `
  mutation inviteUserViaEmail($eventId: ID!, $type: EventUserType!, $text: String!, $emails: [String!]!) {
    inviteUserViaEmail(eventId: $eventId, type: $type, text: $text, emails: $emails)
  }
`;

export const CHANGE_USER_ROLE = `
  mutation changeUserTypeInEvent($eventId: ID!, $userId: ID!, $type: EventUserType!) {
    changeUserTypeInEvent(eventId: $eventId, userId: $userId, type: $type)
  }
`;

export const REMOVE_USER = `
  mutation removeUserFromEvent($eventId: ID!, $userId: ID!) {
    removeUserFromEvent(eventId: $eventId, userId: $userId)
  }
`;

// ---- Section editing -------------------------------------------------------

export const UPDATE_SECTION = `
  mutation updateSection($eventId: ID!, $sectionId: ID!, $payload: UpdateSectionInput!) {
    updateSection(eventId: $eventId, sectionId: $sectionId, payload: $payload) {
      _id name time note description
    }
  }
`;

// ---- Uploads (multipart; see client.gqlUpload) -----------------------------

export const UPLOAD_USER_PHOTO = `
  mutation uploadUserPhoto($photo: Upload!) {
    uploadUserPhoto(photo: $photo) { url mimetype filename }
  }
`;
