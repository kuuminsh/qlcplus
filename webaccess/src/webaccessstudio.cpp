/*
  Q Light Controller Plus
  webaccessstudio.cpp

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0.txt

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QDebug>

#include "webaccessstudio.h"
#include "qlcchannel.h"
#include "scenevalue.h"
#include "function.h"
#include "fixture.h"
#include "scene.h"
#include "doc.h"

static QString toCompactJson(const QJsonValue &value)
{
    QJsonDocument jsonDoc;
    if (value.isArray())
        jsonDoc.setArray(value.toArray());
    else
        jsonDoc.setObject(value.toObject());

    return QString::fromUtf8(jsonDoc.toJson(QJsonDocument::Compact));
}

static Scene *sceneFromId(const Doc *doc, quint32 sceneID)
{
    if (doc == NULL)
        return NULL;

    Function *func = doc->function(sceneID);
    if (func == NULL || func->type() != Function::SceneType)
        return NULL;

    return qobject_cast<Scene *>(func);
}

QString WebAccessStudio::scenesJSON(const Doc *doc)
{
    QJsonArray scenes;

    if (doc != NULL)
    {
        foreach (Function *func, doc->functionsByType(Function::SceneType))
        {
            if (func == NULL || func->isVisible() == false)
                continue;

            QJsonObject obj;
            obj["id"] = qint64(func->id());
            obj["name"] = func->name();
            obj["path"] = func->path(true);
            obj["running"] = func->isRunning();
            obj["fadeIn"] = qint64(func->fadeInSpeed());
            obj["fadeOut"] = qint64(func->fadeOutSpeed());
            scenes.append(obj);
        }
    }

    return toCompactJson(scenes);
}

QString WebAccessStudio::sceneJSON(const Doc *doc, quint32 sceneID)
{
    Scene *scene = sceneFromId(doc, sceneID);
    if (scene == NULL)
        return QString();

    QJsonObject sceneObj;
    sceneObj["id"] = qint64(scene->id());
    sceneObj["name"] = scene->name();
    sceneObj["path"] = scene->path(true);
    sceneObj["running"] = scene->isRunning();

    QJsonArray fixtures;
    foreach (quint32 fxID, scene->fixtures())
    {
        Fixture *fixture = doc->fixture(fxID);
        if (fixture == NULL)
            continue;

        QJsonObject fxObj;
        fxObj["id"] = qint64(fixture->id());
        fxObj["name"] = fixture->name();
        fxObj["universe"] = qint64(fixture->universe() + 1);
        fxObj["address"] = qint64(fixture->address() + 1);

        QJsonArray channels;
        for (quint32 ch = 0; ch < fixture->channels(); ch++)
        {
            const QLCChannel *channel = fixture->channel(ch);
            if (channel == NULL)
                continue;

            SceneValue scv(fixture->id(), ch, 0);
            bool enabled = scene->checkValue(scv);

            QJsonObject chObj;
            chObj["index"] = qint64(ch);
            chObj["name"] = channel->name();
            chObj["group"] = QLCChannel::groupToString(channel->group());
            if (channel->group() == QLCChannel::Intensity)
                chObj["colour"] = QLCChannel::colourToString(channel->colour());
            chObj["enabled"] = enabled;
            chObj["value"] = enabled ? int(scene->value(fixture->id(), ch)) : 0;
            channels.append(chObj);
        }
        fxObj["channels"] = channels;
        fixtures.append(fxObj);
    }
    sceneObj["fixtures"] = fixtures;

    return toCompactJson(sceneObj);
}

static QString valueChangedJSON(quint32 sceneID, quint32 fixtureID, quint32 channel,
                                int value, bool enabled)
{
    QJsonObject obj;
    obj["scene"] = qint64(sceneID);
    obj["fixture"] = qint64(fixtureID);
    obj["channel"] = qint64(channel);
    obj["value"] = value;
    obj["enabled"] = enabled;
    return toCompactJson(obj);
}

QString WebAccessStudio::setSceneValue(Doc *doc, quint32 sceneID, quint32 fixtureID,
                                       quint32 channel, int value)
{
    Scene *scene = sceneFromId(doc, sceneID);
    if (scene == NULL)
        return QString();

    Fixture *fixture = doc->fixture(fixtureID);
    if (fixture == NULL || channel >= fixture->channels())
        return QString();

    // a scene can be extended only with fixtures it already contains
    if (scene->fixtures().contains(fixtureID) == false)
        return QString();

    uchar val = uchar(qBound(0, value, 255));

    // blind = false: apply live if the scene is running
    // checkHTP = false: replace the current value (allows lowering it)
    scene->setValue(SceneValue(fixtureID, channel, val), false, false);

    return valueChangedJSON(sceneID, fixtureID, channel, val, true);
}

QString WebAccessStudio::unsetSceneValue(Doc *doc, quint32 sceneID, quint32 fixtureID,
                                         quint32 channel)
{
    Scene *scene = sceneFromId(doc, sceneID);
    if (scene == NULL)
        return QString();

    Fixture *fixture = doc->fixture(fixtureID);
    if (fixture == NULL || channel >= fixture->channels())
        return QString();

    scene->unsetValue(fixtureID, channel);

    return valueChangedJSON(sceneID, fixtureID, channel, 0, false);
}

bool WebAccessStudio::soloScene(Doc *doc, quint32 sceneID)
{
    Scene *target = sceneFromId(doc, sceneID);
    if (target == NULL)
        return false;

    foreach (Function *func, doc->functionsByType(Function::SceneType))
    {
        if (func != NULL && func != target && func->isRunning())
            func->stop(FunctionParent::master());
    }

    if (target->isRunning() == false)
        target->start(doc->masterTimer(), FunctionParent::master());

    return true;
}

QString WebAccessStudio::projectStatusJSON(const Doc *doc)
{
    QJsonObject obj;
    obj["modified"] = doc != NULL ? doc->isModified() : false;
    return toCompactJson(obj);
}
