function escapeHtml(text) {
  return $('<div/>').text(text).html();
}

function selectText(element) {
  var doc = document;
  var text = doc.getElementById(element);

  if (doc.body.createTextRange) { // ms
      var range = doc.body.createTextRange();
      range.moveToElementText(text);
      range.select();
  } else if (window.getSelection) { // moz, opera, webkit
      var selection = window.getSelection();
      var range = doc.createRange();
      range.selectNodeContents(text);
      selection.removeAllRanges();
      selection.addRange(range);
  }
}

function init(conf) {

  function initDb() {
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', conf.databaseUrl, true);
      xhr.responseType = 'arraybuffer';

      xhr.onload = function (e) {
        var uInt8Array = new Uint8Array(this.response);
        var db = new SQL.Database(uInt8Array);
        resolve({db: db})
      };
      xhr.send();
    })
  }

  function initEditor() {
    var target = document.getElementById("query-editor")
    var editor = CodeMirror(target, $.extend({
      theme: "dracula",
      mode:  "sql",
      indentWithTabs: true,
      smartIndent: true,
      lineNumbers: true,
      matchBrackets : true,
    }, conf.editor));
    return {editor: editor}
  }

  function initCtx() {
    return Promise.all([
      {},
      initDb(),
      initEditor(),
    ]).then(
      function (ctxs) {return $.extend.apply(this, ctxs)}
    )
  }

  return initCtx()
}

function main(conf, ctx) {

  function renderTable(table, id) {
   return (
      '<table class="table" id='+id+'>' +
        '<thead>' +
          '<tr>' +
            (table.columns.map(function(column) {return (
              '<th>' + column + '</th>'
            )}).join('')) +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          (table.values.map(function(row, index) {return (
            '<tr id="' + id +'-row-' + index + '">' +
              (row.map(function(cell) {return (
                '<td>' + cell + '</td>'
              )}).join('')) +
            '</tr>'
          )}).join('')) +
        '</tbody>' +
      '</table>'
    )
  }

  function renderResultButton(index) {
    return (
      '<button ' +
        'class="btn btn-xs" '+
        'onclick="selectText(\'result-table-' + index + '\').select();" ' +
      '>Označ výsledok</button> ' +
      '<small> (po označení je možné výsledok skopírovať do tabuľkových procesorov)</small>'
    )
  }

  function renderResult(result, index) {
   return (
      '<p>' + renderResultButton(index) + '</p>' +
      '<p>' + renderTable(result, "result-table-" + index) + '</p>'
    )
  }

  function rerenderResults(results) {
    var body = results.map(renderResult).join('')
    document.getElementById('results-body').innerHTML = body
  }

  function rerenderResultsError(error) {
    var body = (
      '<div class="alert alert-danger">' +
        '<strong>Chyba:</strong><br/>' +
        error +
      '</div>'
    )
    document.getElementById('results-body').innerHTML = body
  }

  function rerenderResultsCalculating() {
    var body = (
      '<div class="alert alert-info">' +
        'Prebieha výpočet ...' +
      '</div>'
    )
    document.getElementById('results-body').innerHTML = body
  }

  function rerenderQueryList(options) {
    var table = {
      columns: [].concat(options.columns, ['']),
      values: options.data.map(function (row) {
        return [].concat(
          options.keys.map(function (key) {
            return escapeHtml(row[key])
          }),
          ['<button class="btn btn-xs query-setter">Uprav</button>']
        )
      }),
    }
    var body = '<p>' + renderTable(table, options.id) + '</p>'
    document.getElementById(options.mountpoint).innerHTML = body

    options.data.map(function (row, index) {
      $(
        '#' + options.id + '-row-' + index + ' .query-setter'
      ).click(function () {
        ctx.editor.setValue(row.query)
        window.location.hash = 'editor'
      })
    })
  }

  function rerenderHistory(history) {
    rerenderQueryList({
      mountpoint: 'history-body',
      id: 'history-table',
      keys: ['date', 'query'],
      columns: ["Dátum", "Dotaz"],
      data: history,
    })
  }

  function rerenderExamples() {
    rerenderQueryList({
      mountpoint: 'examples-body',
      id: 'examples-table',
      keys: ['description', 'query'],
      columns: ["Popis", "Dotaz"],
      data: conf.examples,
    })
  }

  function loadHistory() {
    try {
      var history = JSON.parse(
        window.localStorage.getItem(conf.storagePrefix + 'history') || '[]'
      )
    } catch (e) {
      var history = []
    }

    return history
  }

  function updateSubmitHistory(query) {
    var history = loadHistory()
    var now = (new Date()).toISOString().replace('T', ' ').replace('Z', '')

    history.unshift({query: query, date: now})
    history = history.slice(0, conf.maxHistoryItems)

    window.localStorage.setItem(
      conf.storagePrefix + 'history', JSON.stringify(history)
    )
    return history
  }

  function enableSubmit() {
    document.getElementById("query-submit").disabled = false
  }

  function disableSubmit() {
    document.getElementById("query-submit").disabled = true
  }

  function processSubmit() {
    rerenderResultsCalculating()
    disableSubmit()

    var query = ctx.editor.getValue()

    var history = updateSubmitHistory(query)
    rerenderHistory(history)

    results = Promise.delay(0).then(function () {
      return ctx.db.exec(query)
    }).catch(rerenderResultsError)

    results.then(rerenderResults)
    results.then(enableSubmit)
    return
  }

  function initSubmit() {
    enableSubmit()
    document.getElementById("query-submit").onclick = function (e) {
      processSubmit()
      e.preventDefault()
    }
  }

  initSubmit()
  rerenderHistory(loadHistory())
  rerenderExamples()
}

$.getJSON('config.json', function (conf) {
  init(conf).then(function (ctx) {main(conf, ctx)})
})
