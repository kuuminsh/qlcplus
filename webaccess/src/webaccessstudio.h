/*
  Q Light Controller Plus
  webaccessstudio.h

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

#ifndef WEBACCESSSTUDIO_H
#define WEBACCESSSTUDIO_H

#include <QString>

class Doc;

/**
 * Helpers for the "studio" web page: list scenes, read and edit
 * scene channel values from a browser. All replies are JSON strings.
 *
 * WebSocket API (sent as "QLC+API|<command>|<params>"):
 *
 *   getScenesJSON
 *       -> QLC+API|getScenesJSON|[{"id","name","path","running","fadeIn","fadeOut"}, ...]
 *
 *   getSceneJSON|<sceneID>
 *       -> QLC+API|getSceneJSON|{"id","name","path","running","fixtures":[
 *              {"id","name","universe","address","channels":[
 *                  {"index","name","group","colour","enabled","value"}]}]}
 *
 *   setSceneValue|<sceneID>|<fixtureID>|<channel>|<value 0-255>
 *       sets (and enables) a channel; applied live if the scene is running.
 *       Broadcast to all clients: QLC+API|sceneValueChanged|{"scene","fixture","channel","value","enabled"}
 *
 *   unsetSceneValue|<sceneID>|<fixtureID>|<channel>
 *       disables a channel in the scene (a running scene keeps the last
 *       value on that channel until it is restarted).
 *       Broadcast: QLC+API|sceneValueChanged|{..., "enabled": false}
 *
 *   soloScene|<sceneID>
 *       stops every other running scene and starts the given one.
 *
 *   getProjectStatus
 *       -> QLC+API|getProjectStatus|{"modified": true/false}
 *
 *   saveProject
 *       -> QLC+API|saveProject|{"result": "ok" | "noFileName" | "error" | "unsupported"}
 */
class WebAccessStudio final
{
public:
    static QString scenesJSON(const Doc *doc);

    /** Returns an empty string if the scene doesn't exist */
    static QString sceneJSON(const Doc *doc, quint32 sceneID);

    /** Returns the broadcast message JSON or an empty string on failure */
    static QString setSceneValue(Doc *doc, quint32 sceneID, quint32 fixtureID,
                                 quint32 channel, int value);

    /** Returns the broadcast message JSON or an empty string on failure */
    static QString unsetSceneValue(Doc *doc, quint32 sceneID, quint32 fixtureID,
                                   quint32 channel);

    static bool soloScene(Doc *doc, quint32 sceneID);

    static QString projectStatusJSON(const Doc *doc);
};

#endif // WEBACCESSSTUDIO_H
