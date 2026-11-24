// ============================================================================
// CaronaPF — backend (Google Apps Script)
// Atualização: suporte a "fechamento mensal" — um mês marcado como fechado
// (config.closedMonths, lista de "YYYY-MM") passa a recusar qualquer escrita
// de carona (marcar, trocar ou limpar) em datas daquele mês, não importa de
// onde vier a chamada. A checagem é feita aqui no servidor — não só no
// index.html — porque uma checagem só no front-end é fácil de contornar
// (bastaria alguém chamar a URL direto). Configurações, nomes e feriados
// continuam editáveis normalmente mesmo com meses fechados.
//
// Fechar/reabrir um mês agora exige a LOCK_PASSWORD abaixo, conferida aqui no
// servidor (type:'toggleMonthLock') — de propósito, closedMonths NÃO é mais
// aceito através de um type:'config' comum (ver setConfig_), senão a senha
// seria só decoração: bastaria mandar a config inteira por aquele caminho.
// ============================================================================

// TROQUE isso por uma senha só sua antes de publicar.
var LOCK_PASSWORD = 'troque-essa-senha';

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = getOrCreateSheets_(ss);
  var configSheet = sheets.config;
  var ridesSheet = sheets.rides;

  var configMap = readConfigMap_(configSheet);
  var config = {
    people: getPeopleFromMap_(configMap, configSheet),
    startDate: formatDate_(configMap['startDate']),
    removedHolidays: safeJsonParse_(configMap['removedHolidays'], []),
    addedHolidays: safeJsonParse_(configMap['addedHolidays'], []),
    closedMonths: safeJsonParse_(configMap['closedMonths'], [])
  };

  var rides = {};
  var data = ridesSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var ds = formatDate_(data[i][0]);
    var driver = data[i][1];
    if (ds && driver) rides[ds] = driver;
  }

  return jsonOutput_({ ok: true, config: config, rides: rides });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'json invalido' });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = getOrCreateSheets_(ss);
    if (body.type === 'ride') {
      if (isMonthClosed_(sheets.config, body.date)) {
        return jsonOutput_({ ok: false, error: 'mes_fechado' });
      }
      setRide_(sheets.rides, body.date, body.driver || '');
    } else if (body.type === 'config') {
      setConfig_(sheets.config, body.config);
    } else if (body.type === 'renamePerson') {
      renamePerson_(sheets.rides, body.from, body.to);
    } else if (body.type === 'toggleMonthLock') {
      if (!body.password || body.password !== LOCK_PASSWORD) {
        return jsonOutput_({ ok: false, error: 'senha_invalida' });
      }
      var closedMonths = toggleClosedMonth_(sheets.config, body.monthKey, !!body.close);
      return jsonOutput_({ ok: true, closedMonths: closedMonths });
    } else {
      return jsonOutput_({ ok: false, error: 'tipo desconhecido' });
    }
  } finally {
    lock.releaseLock();
  }
  return jsonOutput_({ ok: true });
}

function getOrCreateSheets_(ss) {
  var configSheet = ss.getSheetByName('Config');
  if (!configSheet) {
    configSheet = ss.insertSheet('Config');
    configSheet.appendRow(['chave', 'valor']);
    configSheet.appendRow(['people', JSON.stringify(['Gringo', 'Rubian', 'Grilo'])]);
    configSheet.appendRow(['startDate', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')]);
    configSheet.appendRow(['removedHolidays', '[]']);
    configSheet.appendRow(['addedHolidays', '[]']);
    configSheet.appendRow(['closedMonths', '[]']);
  }
  var ridesSheet = ss.getSheetByName('Rides');
  if (!ridesSheet) {
    ridesSheet = ss.insertSheet('Rides');
    ridesSheet.appendRow(['data', 'motorista']);
  }
  // as colunas de data/valor têm que ser sempre TEXTO PURO — senão o Google Sheets "ajuda"
  // convertendo sozinho o texto "2026-09-01" num valor de Data de verdade, e isso pode voltar
  // como o dia errado (a marcação "some" do dia certo no calendário, ou o início da contagem muda).
  ridesSheet.getRange('A:A').setNumberFormat('@');
  configSheet.getRange('B:B').setNumberFormat('@');
  return { config: configSheet, rides: ridesSheet };
}

function readConfigMap_(configSheet) {
  // uma leitura só da aba inteira, virando um mapa {chave: valor} em memória — todo o resto da
  // função lê desse mapa em vez de voltar na planilha de novo pra cada chave.
  var data = configSheet.getDataRange().getValues();
  var map = {};
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) map[data[i][0]] = data[i][1];
  }
  return map;
}

function getPeopleFromMap_(configMap, configSheet) {
  var people = safeJsonParse_(configMap['people'], null);
  if (Array.isArray(people) && people.length) return people;
  // esquema antigo (person1/person2/person3, de uma versão anterior do script) —
  // migra automaticamente na primeira leitura, sem perder nada.
  var legacy = [configMap['person1'], configMap['person2'], configMap['person3']]
    .filter(function (n) { return n; });
  if (legacy.length) {
    setConfigValue_(configSheet, 'people', JSON.stringify(legacy));
    return legacy;
  }
  return ['Colega 1', 'Colega 2', 'Colega 3'];
}

function getConfigValue_(sheet, key) {
  var data = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

function setConfigValue_(sheet, key, value) {
  var data = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setNumberFormat('@').setValue(value);
      return;
    }
  }
  var row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1).setValue(key);
  sheet.getRange(row, 2).setNumberFormat('@').setValue(value);
}

function setConfig_(sheet, config) {
  if (!config) return;
  if (config.people) setConfigValue_(sheet, 'people', JSON.stringify(config.people));
  if (config.startDate) setConfigValue_(sheet, 'startDate', config.startDate);
  if (config.removedHolidays) setConfigValue_(sheet, 'removedHolidays', JSON.stringify(config.removedHolidays));
  if (config.addedHolidays) setConfigValue_(sheet, 'addedHolidays', JSON.stringify(config.addedHolidays));
  // closedMonths é de propósito IGNORADO aqui — só muda através de toggleClosedMonth_, que exige
  // LOCK_PASSWORD. Se isso lesse config.closedMonths como os campos acima, a senha viraria
  // decoração: bastaria mandar um POST comum de config com o closedMonths já alterado.
}

// Fecha ou reabre um mês (monthKey "yyyy-MM") na lista closedMonths da Config. Já assume que a
// senha foi conferida por quem chamou (doPost). Devolve a lista atualizada.
function toggleClosedMonth_(configSheet, monthKey, close) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return safeJsonParse_(getConfigValue_(configSheet, 'closedMonths'), []);
  var configMap = readConfigMap_(configSheet);
  var closedMonths = safeJsonParse_(configMap['closedMonths'], []);
  if (!Array.isArray(closedMonths)) closedMonths = [];
  var idx = closedMonths.indexOf(monthKey);
  if (close) {
    if (idx === -1) closedMonths.push(monthKey);
  } else {
    if (idx !== -1) closedMonths.splice(idx, 1);
  }
  setConfigValue_(configSheet, 'closedMonths', JSON.stringify(closedMonths));
  return closedMonths;
}

// Confere se a data (string "yyyy-MM-dd") cai num mês presente em config.closedMonths
// (lista de strings "yyyy-MM"). Lê a Config direto — chamado uma vez por POST de carona,
// então o custo extra é desprezível perto do resto da chamada.
function isMonthClosed_(configSheet, dateStr) {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 7) return false;
  var monthKey = dateStr.slice(0, 7); // "yyyy-MM"
  var configMap = readConfigMap_(configSheet);
  var closedMonths = safeJsonParse_(configMap['closedMonths'], []);
  return Array.isArray(closedMonths) && closedMonths.indexOf(monthKey) !== -1;
}

function setRide_(sheet, date, driver) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (formatDate_(data[i][0]) === date) {
      sheet.getRange(i + 1, 2).setValue(driver);
      return;
    }
  }
  var row = sheet.getLastRow() + 1;
  // formata a célula como texto puro ANTES de escrever, pra garantir que a data fique
  // exatamente como veio do app, mesmo se a coluna inteira ainda não tiver sido formatada.
  sheet.getRange(row, 1).setNumberFormat('@').setValue(date);
  sheet.getRange(row, 2).setValue(driver);
}

function renamePerson_(sheet, from, to) {
  if (!from || !to || from === to) return;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === from) {
      sheet.getRange(i + 1, 2).setValue(to);
    }
  }
}

function formatDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (typeof value === 'string') {
    // já está limpo, no formato que o app sempre usa — devolve direto.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (!value) return '';
    // se o Sheets converteu a data sozinha em algum momento, ao ler de volta ela pode aparecer
    // como um texto tipo "Mon Sep 14 2026 00:00:00 GMT-0300 (Horário Padrão de Brasília)" em vez
    // de um valor de Data — ainda dá pra recuperar o dia certo reconstruindo a partir do texto,
    // usando o calendário local (sem depender do fuso horário do script bater com o da planilha).
    var parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      var mm = parsed.getMonth() + 1, dd = parsed.getDate();
      return parsed.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
    }
    return value;
  }
  return value ? String(value) : '';
}

function safeJsonParse_(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
