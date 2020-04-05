import { Injectable } from '@angular/core';
import Device from '../device';
import { Observable, Subscriber } from 'rxjs';
import { SystemConfigService } from './system-config.service';
import { SystemConnectionsService } from './system-connections.service';
import { DbCompletionService } from './db-completion.service';
import { SystemConnections } from '../connections';
import { SystemStatusService } from './system-status.service';
import { ProgressService } from './progress.service';

@Injectable({
  providedIn: 'root'
})
export class DeviceService {
  private devices: Device[];
  private sysConns: SystemConnections;
  thisDevice: Device;

  constructor(
    private systemConfigService: SystemConfigService,
    private systemConnectionsService: SystemConnectionsService,
    private dbCompletionService: DbCompletionService,
    private systemStatusService: SystemStatusService,
    private progressService: ProgressService,
  ) { }

  getDeviceStatusInOrder(observer: Subscriber<Device>, startIndex: number) {
    // Return if there aren't any device at the index
    if (startIndex >= (this.devices.length)) {
      observer.complete();
      return;
    }
    const device: Device = this.devices[startIndex];
    startIndex = startIndex + 1;

    // Check if device in the connections
    if (this.sysConns.connections[device.deviceID] === undefined) {
      console.log(this.sysConns.connections)
      console.log("connections undefined", device.deviceID);
      device.stateType = Device.StateType.Unknown;
    } else {
      // Set connected
      device.connected = this.sysConns.connections[device.deviceID].connected;

      // TODO ? temporarily set to connected
      if (device.deviceID === this.thisDevice.deviceID) {
        device.connected = true;
      }
    }

    this.dbCompletionService.getDeviceCompletion(device.deviceID).subscribe(
      c => {
        device.completion = c.completion;
        device.stateType = Device.getStateType(device);
        device.state = Device.stateTypeToString(device.stateType);
        observer.next(device);

        this.progressService.addToProgress(1);

        // recursively get the status of the next folder
        this.getDeviceStatusInOrder(observer, startIndex);
      });
  }

  getAll(): Observable<Device> {
    const deviceObservable: Observable<Device> = new Observable((observer) => {
      // TODO return devices if cached

      this.systemConfigService.getDevices().subscribe(
        devices => {
          this.devices = devices;

          // First check to see which device is local 'thisDevice'
          this.systemStatusService.getSystemStatus().subscribe(
            status => {
              this.devices.forEach(device => {
                if (device.deviceID === status.myID) {
                  console.log("found thisDevice!", device);
                  this.thisDevice = device;
                }
              });

              // TODO Determine if it should ignore thisDevice

              // Check folder devices to see if the device is used
              this.systemConfigService.getFolders().subscribe(
                folders => {
                  // Loop through all folder devices to see if the device is used
                  this.devices.forEach(device => {
                    folders.forEach(folder => {
                      folder.devices.forEach(fdevice => {
                        if (device.deviceID === fdevice.deviceID) {
                          device.used = true;
                        }
                      });
                    });
                  });

                  // See if the connection is connected or undefined 
                  this.systemConnectionsService.getSystemConnections().subscribe(
                    c => {
                      this.sysConns = c;

                      // Synchronously get the status of each device 
                      this.getDeviceStatusInOrder(observer, 0);
                    }
                  );
                });
            }
          )
        },
        err => { console.log("getAll error!", err) },
        () => { console.log("get all complete!") }
      );
    });
    return deviceObservable
  }
}
